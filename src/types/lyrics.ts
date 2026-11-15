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
  ambientLight: boolean;
  autoHideHud: boolean;
  splitLayout: boolean;
}

export type BooleanSettingKey =
  | 'keepAwake'
  | 'hideControls'
  | 'ambientLight'
  | 'autoHideHud'
  | 'splitLayout';

export type NumericSettingKey = Exclude<keyof UISettings, BooleanSettingKey>;

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

export interface LrcLibCandidate {
  id: string;
  trackName: string;
  artistName: string;
  albumName: string;
  durationSec: number;
  hasSynced: boolean;
  hasPlain: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
}

export interface LyricsFetchResult {
  type: 'synced' | 'plain';
  text: string;
  sourceLabel: string;
  selectedId?: string;
  candidates: LrcLibCandidate[];
}

export interface InterludeState {
  active: boolean;
  afterLineIndex: number; // -1 when before line 0 (intro)
  cyclePhase: number; // 0..1 repeating every INTERLUDE_CYCLE_MS
  dotOpacities: [number, number, number];
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
