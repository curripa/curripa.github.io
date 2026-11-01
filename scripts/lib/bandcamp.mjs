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

function isUsableBandcampHtml(html) {
  return html.length >= 1000 && !isChallengeHtml(html) && html.includes('data-tralbum');
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
    jinaResponse = await fetch(jinaUrl, {
      signal: AbortSignal.timeout(30000),
      headers: {
        'x-respond-with': 'html',
        accept: 'text/html',
      },
    });
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
