export interface LyricLine {
  time: number;
  text: string;
}

export interface SpotifyCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface UISettings {
  syncOffset: number;
  fontSize: number;
  vertPos: number;
  blurAmount: number;
  animSpeed: number;
  waveDelay: number;
  plainSpeed: number;
  lineHeight: number;
  margin: number;
  uiScale: number;
  keepAwake: boolean;
  hideControls: boolean;
}

export type NumericSettingKey = Exclude<keyof UISettings, 'keepAwake' | 'hideControls'>;

export interface TrackMetadata {
  id: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  durationMs: number;
}

export interface LrcLibSongItem {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

export interface LyricsFetchResult {
  type: 'synced' | 'plain';
  text: string;
  sourceLabel: string;
}

export type ViewerStatus =
  | 'initial_empty'
  | 'connecting'
  | 'auth_error'
  | 'spotify_idle'
  | 'searching_lyrics'
  | 'lyrics_not_found'
  | 'lyrics_ready';

export type SettingsTab = 'display' | 'spotify';

export type PresetId = 'standard' | 'stand' | 'focus';

