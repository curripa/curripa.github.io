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
