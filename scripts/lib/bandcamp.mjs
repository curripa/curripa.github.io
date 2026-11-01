const CHALLENGE_MARKERS = [
  /<title>\s*Client Challenge\s*<\/title>/i,
  /\/_fs-ch-[^"'\s>]+/,
];

export function isChallengeHtml(html) {
  return CHALLENGE_MARKERS.some((pattern) => pattern.test(html));
}

export function fetchOptions(extra = {}) {
  const userAgent = process.env.BANDCAMP_UA;
  if (!userAgent) return extra;

  return {
    ...extra,
    headers: {
      'user-agent': userAgent,
      ...(extra.headers || {}),
    },
  };
}

export function describeResponse(response, html) {
  const contentType = response.headers.get('content-type') || 'unknown';
  const bytes = Buffer.byteLength(html, 'utf8');
  const challenge = isChallengeHtml(html) ? ' [CHALLENGE]' : '';
  return `HTTP ${response.status} ${contentType} ${bytes}B${challenge} -> ${response.url}`;
}

const JINA_ENABLED = process.env.BANDCAMP_JINA === '1';
const JINA_BASE = 'https://r.jina.ai/';
const JINA_MIN_INTERVAL_MS = 2500;
const JINA_MAX_RETRIES = 3;
let lastJinaRequestAt = 0;

function isUsableBandcampHtml(html) {
  return html.length >= 1000 && !isChallengeHtml(html) && html.includes('data-tralbum');
}

async function fetchJina(url, attempt = 0) {
  const wait = JINA_MIN_INTERVAL_MS - (Date.now() - lastJinaRequestAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastJinaRequestAt = Date.now();

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      'x-respond-with': 'html',
      accept: 'text/html',
      ...(process.env.JINA_API_KEY
        ? { authorization: `Bearer ${process.env.JINA_API_KEY}` }
        : {}),
    },
  });

  if (response.status === 429 && attempt < JINA_MAX_RETRIES) {
    await response.body?.cancel();
    const retryAfter = Number.parseInt(response.headers.get('retry-after') || '', 10);
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60000;
    console.warn(`  · Jina rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${JINA_MAX_RETRIES})`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fetchJina(url, attempt + 1);
  }

  return response;
}

export async function fetchBandcampHtml(url, { timeoutMs = 15000 } = {}) {
  let direct = null;
  let directError = null;

  try {
    const response = await fetch(
      url,
      fetchOptions({ signal: AbortSignal.timeout(timeoutMs) })
    );
    const html = await response.text();
    if (response.ok && isUsableBandcampHtml(html)) {
      return { response, html, via: 'direct' };
    }
    direct = { response, html };
  } catch (err) {
    directError = err;
  }

  if (!JINA_ENABLED) {
    if (directError) throw directError;
    return { ...direct, via: 'direct' };
  }

  const jinaUrl = `${JINA_BASE}${url}`;
  let jinaResponse;
  try {
    jinaResponse = await fetchJina(jinaUrl);
  } catch (err) {
    throw new Error(`Bandcamp and Jina requests failed: ${err.message}`);
  }

  const jinaHtml = await jinaResponse.text();
  if (!jinaResponse.ok || !isUsableBandcampHtml(jinaHtml)) {
    const directStatus = direct?.response
      ? `direct HTTP ${direct.response.status}`
      : `direct ${directError?.message || 'unusable'}`;
    throw new Error(
      `Bandcamp fetch failed (${directStatus}, jina HTTP ${jinaResponse.status})`
    );
  }

  return { response: jinaResponse, html: jinaHtml, via: 'jina' };
}
