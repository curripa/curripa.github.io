import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describeResponse, fetchBandcampHtml, isChallengeHtml } from './lib/bandcamp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bandsDir = join(__dirname, '..', 'src', 'data', 'bands');
const outputDir = join(__dirname, '..', 'src', 'data', 'generated', 'discography');

const STRICT = process.env.BANDCAMP_STRICT === '1';
const DIAGNOSTIC = process.env.BANDCAMP_DIAGNOSTIC === '1';
const failures = [];

mkdirSync(outputDir, { recursive: true });

const normalizeCoverSize = (url) =>
  url.replace(/_\d+(\.\w+)$/, '_10$1');

const normalizeDate = (value) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const bandFiles = readdirSync(bandsDir).filter(f => f.endsWith('.json'));

for (const file of bandFiles) {
  const band = JSON.parse(readFileSync(join(bandsDir, file), 'utf-8'));
  const cachePath = join(outputDir, `${band.id}.json`);
  console.log(`Fetching ${band.name}...`);

  try {
    const { response, html, via } = await fetchBandcampHtml(
      `${band.bandcampUrl}/music`,
      { timeoutMs: 15000 }
    );
    const challenge = isChallengeHtml(html);

    if (DIAGNOSTIC || via === 'jina' || challenge || !response.ok || html.length < 10000) {
      console.log(`  · via=${via} ${describeResponse(response, html)}`);
    }
    if (challenge) {
      throw new Error('Bandcamp bot challenge (DataDome)');
    }
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      throw new Error(`HTTP ${response.status}${retryAfter ? ` (retry-after ${retryAfter})` : ''}`);
    }

    const albums = [];
    const lyricsByTitle = {};

    // 1) Try JSON-LD
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

    // 2) Fallback: scrape music-grid HTML
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

    // Ensure bandcampUrl is always set
    for (const album of albums) {
      if (!album.bandcampUrl) {
        album.bandcampUrl = `${band.bandcampUrl}/album/${album.albumId}`;
      }
      if (album.coverArt) album.coverArt = normalizeCoverSize(album.coverArt);
    }

    if (albums.length === 0) {
      throw new Error('No albums parsed (HTML changed or request challenged)');
    }

    // 3) Fetch each album page for numeric ID and year
    let albumDetailFailures = 0;
    for (const album of albums) {
      if (album.numericId) continue;
      const url = album.bandcampUrl;
      if (!url) continue;
      try {
        const { response: pageRes, html: pageHtml, via } = await fetchBandcampHtml(
          url,
          { timeoutMs: 10000 }
        );

        if (DIAGNOSTIC || via === 'jina') {
          console.log(`  · album via=${via} ${describeResponse(pageRes, pageHtml)}`);
        }
        if (isChallengeHtml(pageHtml)) {
          throw new Error('Bandcamp bot challenge (DataDome)');
        }

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

        // Extract lyrics from album page JSON-LD (fallback for /music without lyrics, e.g. Kyshtym Prototipo)
        const albumLyrics = {};
        const ldAlbumScripts = pageHtml.matchAll(
          /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
        );
        for (const [, json] of ldAlbumScripts) {
          try {
            const data = JSON.parse(json.trim());
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item['@type'] === 'MusicAlbum') {
                for (const entry of item.track?.itemListElement ?? []) {
                  const rec = entry.item || entry;
                  const text = rec.recordingOf?.lyrics?.text;
                  if (rec.name && text) albumLyrics[rec.name] = text;
                }
              }
            }
          } catch { /* skip */ }
        }

        // Extract track listing from data-tralbum JSON attribute
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
              album.tracks = tralbum.trackinfo.map((t) => ({
                trackNum: t.track_num || 0,
                title: t.title || 'Untitled',
                trackId: t.track_id || null,
                duration: t.duration || null,
                audioUrl: pickAudioUrl(t.file),
                lyrics: albumLyrics[t.title] || lyricsByTitle[t.title] || null,
              }));
            }
          } catch { /* skip invalid JSON */ }
        }
      } catch (err) {
        albumDetailFailures++;
        console.warn(`  ↪ Could not fetch detail for "${album.title}": ${err.message}`);
      }
    }

    if (albumDetailFailures > 0) {
      failures.push({
        band: band.name,
        error: `${albumDetailFailures} album detail(s) failed`,
      });
    }

    writeFileSync(cachePath, JSON.stringify(albums, null, 2) + '\n');
    console.log(`  → ${albums.length} album(s) cached`);
  } catch (err) {
    failures.push({ band: band.name, error: err.message });
    console.warn(`  ✗ Failed: ${err.message}`);
    if (!existsSync(cachePath)) {
      console.warn(`  → No cache written for ${band.id}`);
    } else {
      console.warn(`  → Preserved existing cache`);
    }
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length}/${bandFiles.length} band(s) failed:`);
  for (const failure of failures) {
    console.error(`  - ${failure.band}: ${failure.error}`);
  }
  if (STRICT) {
    console.error('BANDCAMP_STRICT=1: aborting build.');
    process.exitCode = 1;
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
