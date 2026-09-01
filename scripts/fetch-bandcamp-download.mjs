import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bandsDir = join(__dirname, '..', 'src', 'data', 'bands');
const outputDir = join(__dirname, '..', 'src', 'data', 'generated', 'discography');
const audioRoot = join(__dirname, '..', 'public', 'audio');
const coverRoot = join(__dirname, '..', 'public', 'img', 'covers');

mkdirSync(outputDir, { recursive: true });

const normalizeCoverSize = (url) =>
  url.replace(/_\d+(\.\w+)$/, '_10$1');

const normalizeDate = (value) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

function sanitizeSegment(value) {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'track';
}

const bandFiles = readdirSync(bandsDir).filter((f) => f.endsWith('.json'));

for (const file of bandFiles) {
  const band = JSON.parse(readFileSync(join(bandsDir, file), 'utf-8'));
  const cachePath = join(outputDir, `${band.id}.json`);
  console.log(`Fetching ${band.name}...`);

  try {
    const response = await fetch(`${band.bandcampUrl}/music`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const albums = [];
    const lyricsByTitle = {};

    const ldScripts = html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    );
    for (const [, json] of ldScripts) {
      try {
        const data = JSON.parse(json.trim());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'MusicAlbum') {
            albums.push({
              albumId: extractAlbumId(item.url || item['@id'] || ''),
              title: item.name || 'Untitled',
              year: item.datePublished
                ? new Date(item.datePublished).getFullYear()
                : null,
              releaseDate: normalizeDate(item.datePublished) || null,
              coverArt: item.image || null,
              bandcampUrl: item.url || null,
              numericId: null,
              tracks: [],
            });

            for (const entry of item.track?.itemListElement ?? []) {
              const recording = entry.item || entry;
              const composition = recording.recordingOf;
              const text = composition?.lyrics?.text;
              if (recording.name && text) {
                lyricsByTitle[recording.name] = text;
              }
            }
          }
        }
      } catch { /* skip */ }
    }

    const existingIds = new Set(albums.map((a) => a.albumId));
    const itemRegex = /<a\s+href="(\/album\/[^"]+)"[^>]*>[\s\S]*?<img([^>]+)>[\s\S]*?<p[^>]*class="title"[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      const href = match[1];
      const albumId = extractAlbumId(href);
      if (existingIds.has(albumId)) continue;
      const imgAttrs = match[2];
      const title = match[3].replace(/<[^>]+>/g, '').trim();
      let coverArt = imgAttrs.match(/data-original="([^"]+)"/)?.[1] || imgAttrs.match(/\ssrc="([^"]+)"/)?.[1] || null;
      if (coverArt === '/img/0.gif') coverArt = null;
      const bandcampUrl = `https://${new URL(band.bandcampUrl).hostname}${href}`;
      albums.push({
        albumId,
        title,
        year: null,
        releaseDate: null,
        coverArt,
        bandcampUrl,
        numericId: null,
        tracks: [],
      });
      existingIds.add(albumId);
    }

    for (const album of albums) {
      if (!album.bandcampUrl) {
        album.bandcampUrl = `${band.bandcampUrl}/album/${album.albumId}`;
      }
      if (album.coverArt) album.coverArt = normalizeCoverSize(album.coverArt);
    }

    const counters = {
      downloaded: 0, skipped: 0, failed: 0,
      covers: { downloaded: 0, skipped: 0, failed: 0 },
    };

    for (const album of albums) {
      if (album.numericId) continue;
      const url = album.bandcampUrl;
      if (!url) continue;
      try {
        const pageRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const pageHtml = await pageRes.text();

        const embedMatch = pageHtml.match(/data-embed="([^"]+)"/);
        if (embedMatch) {
          const raw = embedMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
          const embed = JSON.parse(raw);
          album.numericId = embed.tralbum_param?.value || null;
        }

        const releaseMatch = pageHtml.match(/"release_date":"([^"]+)"/);
        if (releaseMatch) {
          const parsed = new Date(releaseMatch[1]);
          if (!isNaN(parsed.getTime())) album.year = parsed.getFullYear();
          album.releaseDate = normalizeDate(releaseMatch[1]) || album.releaseDate;
        }

        const metaDateMatch = pageHtml.match(/<meta property="music:release_date"\s+content="(\d{4})-(\d{2}-\d{2})"/);
        if (metaDateMatch) {
          album.year = parseInt(metaDateMatch[1]);
          album.releaseDate = `${metaDateMatch[1]}-${metaDateMatch[2]}`;
        }

        const ogImageMatch = pageHtml.match(/<meta property="og:image"\s+content="([^"]+)"/);
        if (ogImageMatch && !album.coverArt) album.coverArt = ogImageMatch[1];

        const tralbumMatch = pageHtml.match(/data-tralbum="([^"]+)"/);
        if (tralbumMatch) {
          try {
            const raw = tralbumMatch[1]
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&#39;/g, "'");
            const tralbum = JSON.parse(raw);
            if (tralbum.album_release_date) {
              const parsed = new Date(tralbum.album_release_date);
              if (!isNaN(parsed.getTime())) album.year = parsed.getFullYear();
              album.releaseDate = normalizeDate(tralbum.album_release_date) || album.releaseDate;
            }
            if (Array.isArray(tralbum.trackinfo)) {
              for (const t of tralbum.trackinfo) {
                const track = {
                  trackNum: t.track_num || 0,
                  title: t.title || 'Untitled',
                  trackId: t.track_id || null,
                  duration: t.duration || null,
                  audioUrl: pickAudioUrl(t.file),
                  lyrics: lyricsByTitle[t.title] || null,
                };
                await downloadTrack(band.id, album, track, counters);
                album.tracks.push(track);
              }
            }
          } catch { /* skip invalid JSON */ }
        }

        await downloadCover(band.id, album, counters);
      } catch (err) {
        console.warn(`  ↪ Could not fetch detail for "${album.title}": ${err.message}`);
      }
    }

    writeFileSync(cachePath, JSON.stringify(albums, null, 2) + '\n');
    console.log(`  → ${albums.length} album(s) cached (${counters.downloaded} down, ${counters.skipped} skip, ${counters.failed} fail, covers ${counters.covers.downloaded}/${counters.covers.skipped}/${counters.covers.failed})`);
  } catch (err) {
    console.warn(`  ✗ Failed: ${err.message}`);
    if (!existsSync(cachePath)) {
      writeFileSync(cachePath, '[]\n');
      console.warn(`  → Created empty cache for ${band.id}`);
    } else {
      console.warn(`  → Preserved existing cache`);
    }
  }
}

async function downloadTrack(bandId, album, track, counters) {
  const audioUrl = track.audioUrl;
  if (!audioUrl || !/\.bcbits\.com\//.test(audioUrl)) return;

  const albumId = album.albumId || '';
  const fileName = `${track.trackNum ?? 0}-${sanitizeSegment(track.title)}.mp3`;
  const absPath = join(audioRoot, bandId, albumId, fileName);
  const localUrl = `/audio/${bandId}/${albumId}/${fileName}`;

  if (existsSync(absPath)) {
    counters.skipped++;
    track.audioUrl = localUrl;
    return;
  }

  try {
    const res = await fetch(audioUrl, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, buffer);
    track.audioUrl = localUrl;
    counters.downloaded++;
    console.log(`  ↓ ${bandId}/${albumId}/${fileName} (${(buffer.length / 1024).toFixed(0)} KiB)`);
  } catch (err) {
    counters.failed++;
    console.warn(`  ✗ Could not download "${track.title}" (${bandId}/${albumId}): ${err.message}`);
  }
}

async function downloadCover(bandId, album, counters) {
  if (!album.coverArt) return;
  const coverUrl = normalizeCoverSize(album.coverArt);
  if (!/\.bcbits\.com\//.test(coverUrl)) return;
  album.coverArt = coverUrl;

  const albumId = album.albumId || '';
  if (!albumId) return;

  const ext = (() => {
    try {
      const m = new URL(coverUrl).pathname.match(/\.[a-z0-9]+$/i);
      return m ? m[0] : '.jpg';
    } catch {
      return '.jpg';
    }
  })();

  const fileName = `${albumId}${ext}`;
  const absPath = join(coverRoot, bandId, fileName);
  const localUrl = `/img/covers/${bandId}/${fileName}`;

  if (existsSync(absPath)) {
    counters.covers.skipped++;
    album.coverArt = localUrl;
    return;
  }

  try {
    const res = await fetch(coverUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, buffer);
    album.coverArt = localUrl;
    counters.covers.downloaded++;
    console.log(`  ↓ cover ${bandId}/${fileName} (${(buffer.length / 1024).toFixed(0)} KiB)`);
  } catch (err) {
    counters.covers.failed++;
    console.warn(`  ✗ Could not download cover "${album.title}" (${bandId}/${albumId}): ${err.message}`);
  }
}

function extractAlbumId(urlOrHref) {
  const m = urlOrHref.match(/\/album\/([a-z0-9-]+)/i);
  return m ? m[1] : '';
}

function pickAudioUrl(file) {
  if (!file || typeof file !== 'object') return null;
  const priority = ['wav', 'flac', 'mp3-320', 'mp3-128'];
  for (const format of priority) {
    if (file[format]) return file[format];
  }
  return null;
}