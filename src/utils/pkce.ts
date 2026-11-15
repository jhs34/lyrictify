const PKCE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export const SPOTIFY_PKCE_SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateRandomUrlSafeString(length = 64): string {
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += PKCE_CHARSET[randomValues[i] % PKCE_CHARSET.length];
  }
  return result;
}

export async function computeCodeChallengeS256(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

export async function generatePkcePair(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}> {
  const codeVerifier = generateRandomUrlSafeString(64);
  const codeChallenge = await computeCodeChallengeS256(codeVerifier);
  const state = generateRandomUrlSafeString(24);
  return { codeVerifier, codeChallenge, state };
}

export function getSpotifyRedirectUri(loc: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  const basePath = loc.pathname.endsWith('/')
    ? loc.pathname
    : loc.pathname.replace(/\/[^/]*$/, '/');
  return `${loc.origin}${basePath}callback.html`;
}

export function buildSpotifyAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId.trim(),
    response_type: 'code',
    redirect_uri: params.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: params.codeChallenge,
    scope: SPOTIFY_PKCE_SCOPES,
    state: params.state,
  });
  return `https://accounts.spotify.com/authorize?${query.toString()}`;
}
