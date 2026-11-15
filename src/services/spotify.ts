import { SpotifyCredentials, TrackMetadata } from '../types/lyrics';
import { encodeBasicAuth } from '../utils/lyrics';

const SP_AUTH_API = 'https://accounts.spotify.com/api/token';
const SP_PLAYER_API = 'https://api.spotify.com/v1/me/player';

export type SpotifyActionResult = 'ok' | 'unauthorized' | 'error';

export async function refreshSpotifyAccessToken(creds: SpotifyCredentials): Promise<string | null> {
  const clientId = creds.clientId.trim();
  const clientSecret = creds.clientSecret.trim();
  const refreshToken = creds.refreshToken.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  // Spotify Client ID and Secret are strictly ASCII hex strings; reject non-ASCII typos cleanly
  if (/[^\x20-\x7E]/.test(clientId) || /[^\x20-\x7E]/.test(clientSecret)) {
    return null;
  }

  const authString = encodeBasicAuth(clientId, clientSecret);
  if (!authString) {
    return null;
  }

  const bodyStr = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authString}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyStr,
  };

  try {
    let response: Response;
    try {
      response = await fetch(SP_AUTH_API, fetchOptions);
    } catch {
      response = await fetch(`https://corsproxy.io/?${encodeURIComponent(SP_AUTH_API)}`, fetchOptions);
    }

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export type SpotifyPollResult =
  | { status: 'no_content' }
  | { status: 'unauthorized' }
  | { status: 'error' }
  | {
      status: 'ok';
      isPlaying: boolean;
      progressMs: number;
      track: TrackMetadata;
    };

interface SpotifyCurrentlyPlayingResponse {
  is_playing?: boolean;
  progress_ms?: number;
  item?: {
    id?: string | null;
    name?: string;
    duration_ms?: number;
    artists?: Array<{ name?: string }>;
    album?: {
      images?: Array<{ url?: string }>;
    };
  } | null;
}

export async function fetchCurrentlyPlaying(accessToken: string): Promise<SpotifyPollResult> {
  try {
    const response = await fetch(`${SP_PLAYER_API}/currently-playing?additional_types=track`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 204) {
      return { status: 'no_content' };
    }

    if (response.status === 401) {
      return { status: 'unauthorized' };
    }

    if (!response.ok) {
      return { status: 'error' };
    }

    const data = (await response.json()) as SpotifyCurrentlyPlayingResponse;
    if (!data || !data.item || !data.item.name) {
      return { status: 'no_content' };
    }

    const artistName =
      data.item.artists && data.item.artists.length > 0
        ? data.item.artists.map((a) => a.name).filter(Boolean).join(', ')
        : 'Unknown Artist';

    const trackId = data.item.id || `local:${data.item.name}:${artistName}`;

    return {
      status: 'ok',
      isPlaying: Boolean(data.is_playing),
      progressMs: data.progress_ms ?? 0,
      track: {
        id: trackId,
        title: data.item.name,
        artist: artistName,
        albumArtUrl: data.item.album?.images?.[0]?.url ?? null,
        durationMs: data.item.duration_ms ?? 0,
      },
    };
  } catch {
    return { status: 'error' };
  }
}

async function performPlayerAction(url: string, method: 'PUT' | 'POST', accessToken: string): Promise<SpotifyActionResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) return 'unauthorized';
    return res.ok || res.status === 204 ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function sendSpotifyPlayPause(
  accessToken: string,
  currentlyPlaying: boolean
): Promise<SpotifyActionResult> {
  const endpoint = currentlyPlaying ? 'pause' : 'play';
  return performPlayerAction(`${SP_PLAYER_API}/${endpoint}`, 'PUT', accessToken);
}

export async function sendSpotifyNext(accessToken: string): Promise<SpotifyActionResult> {
  return performPlayerAction(`${SP_PLAYER_API}/next`, 'POST', accessToken);
}

export async function sendSpotifyPrevious(accessToken: string): Promise<SpotifyActionResult> {
  return performPlayerAction(`${SP_PLAYER_API}/previous`, 'POST', accessToken);
}

export async function sendSpotifySeek(
  accessToken: string,
  positionMs: number
): Promise<SpotifyActionResult> {
  const safePos = Math.max(0, Math.round(positionMs));
  return performPlayerAction(`${SP_PLAYER_API}/seek?position_ms=${safePos}`, 'PUT', accessToken);
}

