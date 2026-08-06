import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bandsDir = join(__dirname, '..', 'src', 'data', 'bands');
const outputDir = join(__dirname, '..', 'src', 'data', 'generated', 'discography');

mkdirSync(outputDir, { recursive: true });

const bandFiles = readdirSync(bandsDir).filter(f => f.endsWith('.json'));

for (const file of bandFiles) {
  const band = JSON.parse(readFileSync(join(bandsDir, file), 'utf-8'));
  const cachePath = join(outputDir, `${band.id}.json`);
  console.log(`Fetching ${band.name}...`);

  try {
    const response = await fetch(`${band.bandcampUrl}/music`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const albums = [];

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
              coverArt: item.image || null,
              bandcampUrl: item.url || null,
              numericId: null,
              tracks: [],
            });
          }
        }
      } catch { /* skip */ }
    }

    // 2) Fallback: scrape music-grid HTML
    if (albums.length === 0) {
      const itemRegex = /<a\s+href="(\/album\/[^"]+)"[^>]*>[\s\S]*?<img\s+src="([^"]+)"[^>]*>[\s\S]*?<p[^>]*class="title"[^>]*>([\s\S]*?)<\/p>/gi;
      let match;
      while ((match = itemRegex.exec(html)) !== null) {
        const href = match[1];
        const coverArt = match[2];
        const title = match[3].replace(/<[^>]+>/g, '').trim();
        const bandcampUrl = `https://${new URL(band.bandcampUrl).hostname}${href}`;
        albums.push({
          albumId: extractAlbumId(href),
          title,
          year: null,
          coverArt,
          bandcampUrl,
          numericId: null,
          tracks: [],
        });
      }
    }

    // Ensure bandcampUrl is always set
    for (const album of albums) {
      if (!album.bandcampUrl) {
        album.bandcampUrl = `${band.bandcampUrl}/album/${album.albumId}`;
      }
    }

    // 3) Fetch each album page for numeric ID and year
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
        }

        const metaDateMatch = pageHtml.match(/<meta property="music:release_date"\s+content="(\d{4})/);
        if (metaDateMatch) album.year = parseInt(metaDateMatch[1]);

        const ogImageMatch = pageHtml.match(/<meta property="og:image"\s+content="([^"]+)"/);
        if (ogImageMatch && !album.coverArt) album.coverArt = ogImageMatch[1];

        // Extract track listing from data-tralbum JSON attribute
        const tralbumMatch = pageHtml.match(/data-tralbum="([^"]+)"/);
        if (tralbumMatch) {
          try {
            const raw = tralbumMatch[1]
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&#39;/g, "'");
            const tralbum = JSON.parse(raw);
            if (Array.isArray(tralbum.trackinfo)) {
              album.tracks = tralbum.trackinfo.map((t) => ({
                trackNum: t.track_num || 0,
                title: t.title || 'Untitled',
                trackId: t.track_id || null,
                duration: t.duration || null,
                audioUrl: pickAudioUrl(t.file),
              }));
            }
          } catch { /* skip invalid JSON */ }
        }
      } catch (err) {
        console.warn(`  ↪ Could not fetch detail for "${album.title}": ${err.message}`);
      }
    }

    writeFileSync(cachePath, JSON.stringify(albums, null, 2) + '\n');
    console.log(`  → ${albums.length} album(s) cached`);
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
