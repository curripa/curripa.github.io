import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describeResponse, fetchOptions, isChallengeHtml } from './lib/bandcamp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bandsDir = join(__dirname, '..', 'src', 'data', 'bands');

const bandFiles = readdirSync(bandsDir).filter((f) => f.endsWith('.json'));
const ua = process.env.BANDCAMP_UA ? `ua="${process.env.BANDCAMP_UA}"` : 'ua=default';

console.log(`node ${process.version} undici ${process.versions.undici ?? 'n/a'} ${ua}`);

let failures = 0;

for (const file of bandFiles) {
  const band = JSON.parse(readFileSync(join(bandsDir, file), 'utf-8'));
  const url = `${band.bandcampUrl}/music`;

  try {
    const response = await fetch(url, fetchOptions({ signal: AbortSignal.timeout(15000) }));
    const html = await response.text();
    const challenge = isChallengeHtml(html);
    const hasTralbum = html.includes('data-tralbum');
    const hasMusicAlbum = html.includes('MusicAlbum');

    console.log(`${band.name}: ${describeResponse(response, html)} tralbum=${hasTralbum} musicAlbum=${hasMusicAlbum}`);

    if (challenge) {
      failures++;
      const snippet = html.replace(/\s+/g, ' ').slice(0, 160);
      console.log(`  ↪ ${snippet}`);
    }
  } catch (err) {
    failures++;
    console.log(`${band.name}: ERROR ${err.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures}/${bandFiles.length} band(s) failed`);
  process.exitCode = 1;
} else {
  console.log(`\n${bandFiles.length}/${bandFiles.length} band(s) OK`);
}
