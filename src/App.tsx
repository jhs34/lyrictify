import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import previewAlbumCover from './assets/images/preview_album_cover_1794683829452.jpg';
import { AmbientBackdrop } from './components/AmbientBackdrop';
import { Header } from './components/Header';
import { LyricPickerModal } from './components/LyricPickerModal';
import { LyricsViewport } from './components/LyricsViewport';
import { MediaControls } from './components/MediaControls';
import { SettingsModal } from './components/SettingsModal';
import { useIdleAutoHide } from './hooks/useIdleAutoHide';
import { useSplitLayoutMorph } from './hooks/useSplitLayoutMorph';
import { useWakeLock } from './hooks/useWakeLock';
import { searchLyricsOnLrcLib } from './services/lrclib';
import {
  SpotifyActionResult,
  SpotifyTokenResponse,
  exchangeSpotifyPkceCode,
  fetchCurrentlyPlaying,
  refreshSpotifyAccessToken,
  sendSpotifyNext,
  sendSpotifyPlayPause,
  sendSpotifyPrevious,
  sendSpotifySeek,
} from './services/spotify';
import {
  BooleanSettingKey,
  LrcLibCandidate,
  LyricLine,
  NumericSettingKey,
  PresetId,
  SettingsTab,
  SpotifyCredentials,
  TrackMetadata,
  UISettings,
  ViewerStatus,
} from './types/lyrics';
import {
  DEFAULT_UI_SETTINGS,
  MOBILE_LANDSCAPE_MEDIA_QUERY,
  PREVIEW_CANDIDATES,
  PREVIEW_DURATION_MS,
  PREVIEW_LRC,
  UI_PRESETS,
  computeTrackProgressMs,
  isMobileLandscapeViewport,
  parseLRC,
  parsePlainLyrics,
  resetSingleSetting,
  shouldResyncPlaybackClock,
  stepSyncOffset,
} from './utils/lyrics';
import {
  buildSpotifyAuthorizeUrl,
  generatePkcePair,
  getSpotifyRedirectUri,
} from './utils/pkce';
import {
  applySettingsToDocumentCss,
  clearPkceSession,
  clearStoredCredentials,
  consumePendingPkceCallback,
  loadPkceSession,
  loadStoredCredentials,
  loadStoredUISettings,
  saveAllUISettings,
  saveBooleanSetting,
  saveNumericSetting,
  savePkceSession,
  saveStoredCredentials,
} from './utils/storage';

const PREVIEW_TRACK: TrackMetadata = {
  id: 'lyrictify-preview-track',
  title: 'UI 미리보기 체험',
  artist: '실시간 싱크 미리보기',
  albumArtUrl: previewAlbumCover,
  durationMs: PREVIEW_DURATION_MS,
};

export default function App() {
  const [credentials, setCredentials] = useState<SpotifyCredentials>(() => loadStoredCredentials());
  const [settings, setSettings] = useState<UISettings>(() => loadStoredUISettings());

  const [isModalOpen, setIsModalOpen] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart');
    if (autostart === '1' || autostart === 'vinyl') return false;
    const stored = loadStoredCredentials();
    return !stored.refreshToken.trim();
  });

  const [modalInitialTab, setModalInitialTab] = useState<SettingsTab>(() => {
    const stored = loadStoredCredentials();
    return stored.refreshToken.trim() ? 'display' : 'spotify';
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [draggingSliderKey, setDraggingSliderKey] = useState<NumericSettingKey | null>(null);
  const [isTransparentDrag, setIsTransparentDrag] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const [status, setStatus] = useState<ViewerStatus>('initial_empty');
  const [track, setTrack] = useState<TrackMetadata | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [isPlainLyrics, setIsPlainLyrics] = useState<boolean>(false);
  const [lyricSource, setLyricSource] = useState<string>('');
  const [lyricCandidates, setLyricCandidates] = useState<LrcLibCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [isPkceAuthorizing, setIsPkceAuthorizing] = useState<boolean>(false);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [progressAnchorMs, setProgressAnchorMs] = useState<number>(0);
  const [anchorTimestamp, setAnchorTimestamp] = useState<number>(() => performance.now());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLargeViewport, setIsLargeViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? isMobileLandscapeViewport(window.innerWidth, window.innerHeight)
      : false
  );

  const accessTokenRef = useRef<string>('');
  const currentSongIdRef = useRef<string>('');
  const isPreviewRef = useRef<boolean>(false);
  const lyricsAbortRef = useRef<AbortController | null>(null);
  const dragHoldTimerRef = useRef<number | null>(null);
  const dragReleaseTimerRef = useRef<number | null>(null);
  const syncFeedbackTimerRef = useRef<number | null>(null);
  const popupWatchTimerRef = useRef<number | null>(null);
  const playbackClockRef = useRef({
    isPlaying,
    progressAnchorMs,
    anchorTimestamp,
    showControls,
  });
  playbackClockRef.current = {
    isPlaying,
    progressAnchorMs,
    anchorTimestamp,
    showControls,
  };

  useWakeLock(settings.keepAwake);
  const isIdleHidden = useIdleAutoHide(
    settings.autoHideHud &&
      !isModalOpen &&
      !isPickerOpen &&
      (status === 'lyrics_ready' || status === 'lyrics_not_found')
  );

  // Sync CSS variables synchronously before layout measurements in child effects
  useLayoutEffect(() => {
    applySettingsToDocumentCss(settings);
  }, [settings]);

  const showTemporarySyncFeedback = useCallback((offsetMs: number) => {
    if (syncFeedbackTimerRef.current !== null) {
      window.clearTimeout(syncFeedbackTimerRef.current);
    }
    const label =
      offsetMs === 0
        ? '싱크 0ms'
        : offsetMs > 0
          ? `싱크 +${offsetMs}ms`
          : `싱크 ${offsetMs}ms`;
    setSyncFeedback(label);
    syncFeedbackTimerRef.current = window.setTimeout(() => {
      setSyncFeedback(null);
    }, 1400);
  }, []);

  // Track Fullscreen API state, desktop lg (1024px) split-view breakpoint, and compact mobile landscape
  useEffect(() => {
    const syncFsState = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', syncFsState);
    document.addEventListener('webkitfullscreenchange', syncFsState);

    const mql = window.matchMedia('(min-width: 1024px)');
    const mobileLandMql = window.matchMedia(MOBILE_LANDSCAPE_MEDIA_QUERY);
    const syncViewportFlags = () => {
      setIsLargeViewport(mql.matches);
      setIsMobileLandscape(isMobileLandscapeViewport(window.innerWidth, window.innerHeight));
    };
    syncViewportFlags();

    mql.addEventListener('change', syncViewportFlags);
    mobileLandMql.addEventListener('change', syncViewportFlags);
    window.addEventListener('resize', syncViewportFlags);
    window.addEventListener('orientationchange', syncViewportFlags);

    return () => {
      document.removeEventListener('fullscreenchange', syncFsState);
      document.removeEventListener('webkitfullscreenchange', syncFsState);
      mql.removeEventListener('change', syncViewportFlags);
      mobileLandMql.removeEventListener('change', syncViewportFlags);
      window.removeEventListener('resize', syncViewportFlags);
      window.removeEventListener('orientationchange', syncViewportFlags);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const elem = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };

    try {
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (elem.requestFullscreen) {
          void elem.requestFullscreen().catch(() => {});
        } else if (elem.webkitRequestFullscreen) {
          void elem.webkitRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          void doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          void doc.webkitExitFullscreen();
        }
      }
    } catch {
      // Ignore fullscreen restrictions in embedded frames
    }
  }, []);

  const applyRefreshedToken = useCallback(
    (baseCreds: SpotifyCredentials, tokenRes: SpotifyTokenResponse): SpotifyCredentials => {
      accessTokenRef.current = tokenRes.accessToken;
      if (
        tokenRes.rotatedRefreshToken &&
        tokenRes.rotatedRefreshToken !== baseCreds.refreshToken
      ) {
        const updated: SpotifyCredentials = {
          ...baseCreds,
          refreshToken: tokenRes.rotatedRefreshToken,
        };
        saveStoredCredentials(updated);
        setCredentials(updated);
        return updated;
      }
      return baseCreds;
    },
    []
  );

  const loadLyricsForTrack = useCallback(async (nextTrack: TrackMetadata) => {
    lyricsAbortRef.current?.abort();
    const controller = new AbortController();
    lyricsAbortRef.current = controller;

    setStatus('searching_lyrics');
    setLyrics([]);
    setLyricSource('');
    setIsPlainLyrics(false);
    setLyricCandidates([]);
    setSelectedCandidateId(null);

    const found = await searchLyricsOnLrcLib(
      nextTrack.title,
      nextTrack.artist,
      nextTrack.durationMs,
      controller.signal
    );

    if (controller.signal.aborted) return;

    if (found) {
      setLyricCandidates(found.candidates);
      setSelectedCandidateId(found.selectedId ?? null);
      const plain = found.type === 'plain';
      const parsed = plain ? parsePlainLyrics(found.text) : parseLRC(found.text);
      if (parsed.length > 0) {
        setIsPlainLyrics(plain);
        setLyricSource(found.sourceLabel);
        setLyrics(parsed);
        setStatus('lyrics_ready');
        return;
      }
    }

    setStatus('lyrics_not_found');
  }, []);

  const pollSpotifyPlayback = useCallback(
    async (credsForRefresh: SpotifyCredentials) => {
      if (!accessTokenRef.current || isPreviewRef.current) return;

      const reqStart = performance.now();
      const result = await fetchCurrentlyPlaying(accessTokenRef.current);
      const reqEnd = performance.now();
      if (isPreviewRef.current) return;

      if (result.status === 'no_content') {
        if (playbackClockRef.current.isPlaying) {
          setIsPlaying(false);
        }
        if (!currentSongIdRef.current) {
          if (playbackClockRef.current.showControls) {
            setShowControls(false);
          }
          setStatus((prev) => (prev === 'spotify_idle' ? prev : 'spotify_idle'));
        }
        return;
      }

      if (result.status === 'unauthorized') {
        const refreshed = await refreshSpotifyAccessToken(credsForRefresh);
        if (refreshed) {
          applyRefreshedToken(credsForRefresh, refreshed);
        } else {
          setIsPlaying(false);
          setShowControls(false);
          setStatus('auth_error');
          setModalInitialTab('spotify');
          setIsModalOpen(true);
        }
        return;
      }

      if (result.status === 'error') {
        return;
      }

      const clock = playbackClockRef.current;
      const trackChanged = currentSongIdRef.current !== result.track.id;
      const localProgressMs = computeTrackProgressMs(
        clock.progressAnchorMs,
        clock.anchorTimestamp,
        reqEnd,
        clock.isPlaying,
        false
      );
      const syncDecision = shouldResyncPlaybackClock({
        localProgressMs,
        remoteProgressMs: result.progressMs,
        rttMs: reqEnd - reqStart,
        isPlaying: result.isPlaying,
        wasPlaying: clock.isPlaying,
        trackChanged,
      });

      if (!clock.showControls) {
        setShowControls(true);
      }
      if (clock.isPlaying !== result.isPlaying) {
        setIsPlaying(result.isPlaying);
      }
      if (syncDecision.shouldUpdate) {
        setProgressAnchorMs(syncDecision.nextProgressMs);
        setAnchorTimestamp(reqEnd);
      }

      if (trackChanged) {
        currentSongIdRef.current = result.track.id;
        setTrack(result.track);
        void loadLyricsForTrack(result.track);
      } else {
        setTrack((prev) => prev ?? result.track);
      }
    },
    [applyRefreshedToken, loadLyricsForTrack]
  );

  // Execute a Spotify player command and automatically refresh token + retry once on 401
  const executeSpotifyAction = useCallback(
    async (action: (token: string) => Promise<SpotifyActionResult>): Promise<boolean> => {
      if (!accessTokenRef.current) return false;
      const firstAttempt = await action(accessTokenRef.current);
      if (firstAttempt === 'ok') return true;
      if (firstAttempt === 'unauthorized') {
        const refreshed = await refreshSpotifyAccessToken(credentials);
        if (!refreshed) {
          setIsPlaying(false);
          setShowControls(false);
          setStatus('auth_error');
          setModalInitialTab('spotify');
          setIsModalOpen(true);
          return false;
        }
        applyRefreshedToken(credentials, refreshed);
        const retry = await action(refreshed.accessToken);
        return retry === 'ok';
      }
      return false;
    },
    [credentials, applyRefreshedToken]
  );

  const connectSpotify = useCallback(
    async (creds: SpotifyCredentials) => {
      lyricsAbortRef.current?.abort();
      isPreviewRef.current = false;
      setIsPreviewMode(false);
      currentSongIdRef.current = '';
      setTrack(null);
      setLyrics([]);
      setLyricCandidates([]);
      setSelectedCandidateId(null);
      setShowControls(false);
      setStatus('connecting');

      const tokenRes = await refreshSpotifyAccessToken(creds);
      if (!tokenRes) {
        accessTokenRef.current = '';
        setStatus('auth_error');
        setModalInitialTab('spotify');
        setIsModalOpen(true);
        return;
      }

      const activeCreds = applyRefreshedToken(creds, tokenRes);
      await pollSpotifyPlayback(activeCreds);
    },
    [applyRefreshedToken, pollSpotifyPlayback]
  );

  const completePkceCallback = useCallback(
    async (payload: { code: string; state: string; error: string }) => {
      if (popupWatchTimerRef.current !== null) {
        window.clearInterval(popupWatchTimerRef.current);
        popupWatchTimerRef.current = null;
      }
      setIsPkceAuthorizing(false);

      const session = loadPkceSession();
      clearPkceSession();

      if (payload.error) {
        setValidationError('Spotify 권한 승인이 취소되었거나 거부되었습니다');
        setModalInitialTab('spotify');
        setIsModalOpen(true);
        return;
      }

      if (!session || !payload.code || payload.state !== session.state) {
        setValidationError('인증 세션 상태가 일치하지 않습니다. 다시 원클릭 연결을 시도해주세요');
        setModalInitialTab('spotify');
        setIsModalOpen(true);
        return;
      }

      setValidationError(null);
      setStatus('connecting');

      const exchanged = await exchangeSpotifyPkceCode({
        clientId: session.clientId,
        code: payload.code,
        codeVerifier: session.codeVerifier,
        redirectUri: session.redirectUri,
      });

      if (!exchanged) {
        accessTokenRef.current = '';
        setStatus('auth_error');
        setValidationError('토큰 발급에 실패했습니다. Spotify 앱의 Redirect URI 등록을 확인해주세요');
        setModalInitialTab('spotify');
        setIsModalOpen(true);
        return;
      }

      const nextCreds: SpotifyCredentials = {
        clientId: session.clientId,
        clientSecret: '',
        refreshToken: exchanged.refreshToken,
      };
      saveStoredCredentials(nextCreds);
      setCredentials(nextCreds);
      accessTokenRef.current = exchanged.accessToken;
      isPreviewRef.current = false;
      setIsPreviewMode(false);
      currentSongIdRef.current = '';
      setTrack(null);
      setLyrics([]);
      setIsModalOpen(false);
      await pollSpotifyPlayback(nextCreds);
    },
    [pollSpotifyPlayback]
  );

  const handleStartPkceConnect = useCallback(async (rawClientId: string) => {
    const trimmedId = rawClientId.trim();
    if (!trimmedId || /[^\x20-\x7E]/.test(trimmedId)) {
      setValidationError('유효한 Spotify Client ID를 입력해주세요');
      return;
    }

    setValidationError(null);

    try {
      const { codeVerifier, codeChallenge, state } = await generatePkcePair();
      const redirectUri = getSpotifyRedirectUri();

      savePkceSession({
        clientId: trimmedId,
        codeVerifier,
        state,
        redirectUri,
      });

      setCredentials((prev) => {
        const updated = { ...prev, clientId: trimmedId };
        saveStoredCredentials(updated);
        return updated;
      });

      const authUrl = buildSpotifyAuthorizeUrl({
        clientId: trimmedId,
        redirectUri,
        codeChallenge,
        state,
      });

      const popup = window.open(authUrl, 'spotify_pkce_popup', 'width=520,height=720');
      if (!popup) {
        clearPkceSession();
        setIsPkceAuthorizing(false);
        setValidationError('브라우저 팝업 차단을 해제한 뒤 다시 시도해주세요');
        return;
      }

      setIsPkceAuthorizing(true);

      if (popupWatchTimerRef.current !== null) {
        window.clearInterval(popupWatchTimerRef.current);
      }
      popupWatchTimerRef.current = window.setInterval(() => {
        if (popup.closed) {
          if (popupWatchTimerRef.current !== null) {
            window.clearInterval(popupWatchTimerRef.current);
            popupWatchTimerRef.current = null;
          }
          const pending = consumePendingPkceCallback();
          if (pending && (pending.code || pending.error)) {
            void completePkceCallback(pending);
          } else {
            setIsPkceAuthorizing(false);
          }
        }
      }, 700);
    } catch {
      setIsPkceAuthorizing(false);
      setValidationError('PKCE 보안 코드 생성에 실패했습니다. 브라우저 환경을 확인해주세요');
    }
  }, [completePkceCallback]);

  // Listen for postMessage from /callback.html popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }

      const data = event.data as
        | { type?: string; code?: string; state?: string; error?: string }
        | undefined;
      if (data?.type !== 'LYRICTIFY_SPOTIFY_PKCE_CALLBACK') {
        return;
      }

      consumePendingPkceCallback();
      void completePkceCallback({
        code: data.code ?? '',
        state: data.state ?? '',
        error: data.error ?? '',
      });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [completePkceCallback]);

  // Clean up popup watch interval on unmount
  useEffect(() => {
    return () => {
      if (popupWatchTimerRef.current !== null) {
        window.clearInterval(popupWatchTimerRef.current);
      }
    };
  }, []);

  const startPreviewMode = useCallback((options?: { withoutLyrics?: boolean }) => {
    const withoutLyrics = Boolean(options?.withoutLyrics);
    lyricsAbortRef.current?.abort();
    isPreviewRef.current = true;
    accessTokenRef.current = '';
    currentSongIdRef.current = PREVIEW_TRACK.id;

    setValidationError(null);
    setIsModalOpen(false);
    setIsPickerOpen(false);
    setModalInitialTab('display');
    setIsPreviewMode(true);
    setTrack(PREVIEW_TRACK);
    setIsPlainLyrics(false);
    setLyricCandidates(PREVIEW_CANDIDATES);

    if (withoutLyrics) {
      setLyricSource('');
      setLyrics([]);
      setSelectedCandidateId(null);
      setStatus('lyrics_not_found');
    } else {
      setLyricSource('LRCLIB · 미리보기');
      setLyrics(parseLRC(PREVIEW_LRC));
      setSelectedCandidateId(PREVIEW_CANDIDATES[0].id);
      setStatus('lyrics_ready');
    }

    setIsPlaying(true);
    setShowControls(true);
    setProgressAnchorMs(0);
    setAnchorTimestamp(performance.now());
  }, []);

  const handleSelectNoLyrics = useCallback(() => {
    setIsPlainLyrics(false);
    setLyricSource('');
    setLyrics([]);
    setSelectedCandidateId(null);
    setStatus('lyrics_not_found');
    setIsPickerOpen(false);
  }, []);

  const handleSelectCandidate = useCallback(
    (candidate: LrcLibCandidate, mode: 'synced' | 'plain') => {
      const usePlain = mode === 'plain' || !candidate.syncedLyrics;
      const rawText = usePlain
        ? (candidate.plainLyrics ?? candidate.syncedLyrics ?? '')
        : (candidate.syncedLyrics ?? '');
      const parsed = usePlain ? parsePlainLyrics(rawText) : parseLRC(rawText);
      if (parsed.length === 0) return;

      setIsPlainLyrics(usePlain);
      setLyricSource(
        isPreviewRef.current
          ? usePlain
            ? '미리보기 (일반 가사)'
            : 'LRCLIB · 미리보기'
          : usePlain
            ? 'LRCLIB (일반 가사)'
            : 'LRCLIB'
      );
      setLyrics(parsed);
      setSelectedCandidateId(candidate.id);
      setStatus('lyrics_ready');
      setIsPickerOpen(false);
    },
    []
  );

  const handleDisconnectSpotify = useCallback(() => {
    lyricsAbortRef.current?.abort();
    clearStoredCredentials();
    clearPkceSession();
    accessTokenRef.current = '';
    currentSongIdRef.current = '';
    setCredentials({ clientId: '', clientSecret: '', refreshToken: '' });
    setValidationError(null);
    setIsPkceAuthorizing(false);

    if (!isPreviewRef.current) {
      setIsPlaying(false);
      setShowControls(false);
      setTrack(null);
      setLyrics([]);
      setLyricCandidates([]);
      setSelectedCandidateId(null);
      setStatus('initial_empty');
    }
  }, []);

  // Initial boot: PKCE standalone callback, ?autostart=1 preview, or saved Spotify refresh token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code') ?? '';
    const urlState = params.get('state') ?? '';
    const urlError = params.get('error') ?? '';

    if ((urlCode || urlError) && loadPkceSession()) {
      window.history.replaceState({}, '', window.location.pathname);
      void completePkceCallback({ code: urlCode, state: urlState, error: urlError });
      return;
    }

    const pendingCallback = consumePendingPkceCallback();
    if (pendingCallback && (pendingCallback.code || pendingCallback.error) && loadPkceSession()) {
      void completePkceCallback(pendingCallback);
      return;
    }

    const autostart = params.get('autostart');
    if (autostart === '1' || autostart === 'vinyl') {
      startPreviewMode({ withoutLyrics: autostart === 'vinyl' });
      return;
    }

    const saved = loadStoredCredentials();
    if (saved.clientId && saved.refreshToken) {
      void connectSpotify(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll Spotify every 3 seconds when connected and not in preview mode
  useEffect(() => {
    if (
      isPreviewMode ||
      status === 'initial_empty' ||
      status === 'auth_error' ||
      status === 'connecting'
    ) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void pollSpotifyPlayback(credentials);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [isPreviewMode, status, credentials, pollSpotifyPlayback]);

  const handleSaveAndConnect = (nextCreds: SpotifyCredentials) => {
    const trimmed: SpotifyCredentials = {
      clientId: nextCreds.clientId.trim(),
      clientSecret: nextCreds.clientSecret.trim(),
      refreshToken: nextCreds.refreshToken.trim(),
    };

    if (!trimmed.clientId || !trimmed.refreshToken) {
      setValidationError('Client ID와 Refresh Token을 입력해주세요');
      return;
    }

    setValidationError(null);
    saveStoredCredentials(trimmed);
    setCredentials(trimmed);
    setIsModalOpen(false);
    void connectSpotify(trimmed);
  };

  const handleTogglePlayPause = useCallback(async () => {
    const now = performance.now();
    if (isPreviewMode) {
      if (isPlaying) {
        const normalized = computeTrackProgressMs(
          progressAnchorMs,
          anchorTimestamp,
          now,
          true,
          true
        );
        setProgressAnchorMs(normalized);
        setAnchorTimestamp(now);
        setIsPlaying(false);
      } else {
        setAnchorTimestamp(now);
        setIsPlaying(true);
      }
      return;
    }

    const ok = await executeSpotifyAction((token) => sendSpotifyPlayPause(token, isPlaying));
    if (ok) {
      if (isPlaying) {
        setProgressAnchorMs((prev) => prev + Math.max(0, now - anchorTimestamp));
        setAnchorTimestamp(now);
        setIsPlaying(false);
      } else {
        setAnchorTimestamp(now);
        setIsPlaying(true);
      }
      window.setTimeout(() => {
        void pollSpotifyPlayback(credentials);
      }, 1000);
    }
  }, [
    isPreviewMode,
    isPlaying,
    progressAnchorMs,
    anchorTimestamp,
    executeSpotifyAction,
    pollSpotifyPlayback,
    credentials,
  ]);

  const handlePrevious = async () => {
    if (isPreviewMode) return;
    const ok = await executeSpotifyAction((token) => sendSpotifyPrevious(token));
    if (ok) {
      window.setTimeout(() => {
        void pollSpotifyPlayback(credentials);
      }, 1000);
    }
  };

  const handleNext = async () => {
    if (isPreviewMode) return;
    const ok = await executeSpotifyAction((token) => sendSpotifyNext(token));
    if (ok) {
      window.setTimeout(() => {
        void pollSpotifyPlayback(credentials);
      }, 1000);
    }
  };

  const handleSeekLyric = async (timeMs: number) => {
    const now = performance.now();
    if (isPreviewMode) {
      const safePreviewTime =
        ((timeMs % PREVIEW_DURATION_MS) + PREVIEW_DURATION_MS) % PREVIEW_DURATION_MS;
      setProgressAnchorMs(safePreviewTime);
      setAnchorTimestamp(now);
      if (!isPlaying) setIsPlaying(true);
      return;
    }

    const seekOk = await executeSpotifyAction((token) => sendSpotifySeek(token, timeMs));
    if (!seekOk) return;

    setProgressAnchorMs(timeMs);
    setAnchorTimestamp(now);
    if (!isPlaying) {
      const playOk = await executeSpotifyAction((token) => sendSpotifyPlayPause(token, false));
      if (playOk) setIsPlaying(true);
    }
  };

  const handleUpdateNumericSetting = useCallback((key: NumericSettingKey, value: number) => {
    saveNumericSetting(key, value);
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleStepSyncOffset = useCallback((deltaMs: number) => {
    setSettings((prev) => {
      const nextOffset = stepSyncOffset(prev.syncOffset, deltaMs);
      saveNumericSetting('syncOffset', nextOffset);
      return { ...prev, syncOffset: nextOffset };
    });
  }, []);

  const handleApplyPreset = useCallback((presetId: PresetId) => {
    const found = UI_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setSettings((prev) => {
      const next: UISettings = { ...prev, ...found.patch };
      saveAllUISettings(next);
      return next;
    });
  }, []);

  const isVinylMode = status === 'lyrics_not_found' && Boolean(track);
  const isDesktopSplitActive = Boolean(settings.splitLayout && track && isLargeViewport);
  const canMorphSplitLayout = Boolean(track && !isVinylMode && isLargeViewport);

  const {
    viewportRootRef,
    activeMorphDirection,
    isMorphingSplitTransition,
    captureBeforeSplitToggle,
  } = useSplitLayoutMorph(isDesktopSplitActive, canMorphSplitLayout);

  const handleUpdateBooleanSetting = useCallback(
    (key: BooleanSettingKey, value: boolean) => {
      if (key === 'splitLayout') {
        captureBeforeSplitToggle();
      }
      saveBooleanSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [captureBeforeSplitToggle]
  );

  const handleResetSingleSetting = useCallback(
    (key: keyof UISettings) => {
      if (key === 'splitLayout') {
        captureBeforeSplitToggle();
      }
      setSettings((prev) => {
        const next = resetSingleSetting(prev, key);
        const nextVal = next[key];
        if (typeof nextVal === 'boolean') {
          saveBooleanSetting(key as BooleanSettingKey, nextVal);
        } else {
          saveNumericSetting(key as NumericSettingKey, nextVal);
        }
        return next;
      });
    },
    [captureBeforeSplitToggle]
  );

  const handleResetDefaults = () => {
    if (settings.splitLayout !== DEFAULT_UI_SETTINGS.splitLayout) {
      captureBeforeSplitToggle();
    }
    saveAllUISettings(DEFAULT_UI_SETTINGS);
    setSettings({ ...DEFAULT_UI_SETTINGS });
  };

  const handleSliderDragStart = (key: NumericSettingKey) => {
    if (dragReleaseTimerRef.current !== null) {
      window.clearTimeout(dragReleaseTimerRef.current);
      dragReleaseTimerRef.current = null;
    }
    if (dragHoldTimerRef.current !== null) {
      window.clearTimeout(dragHoldTimerRef.current);
    }
    // Delay transparent modal preview slightly so quick clicks/nudges on sliders never blink the modal
    dragHoldTimerRef.current = window.setTimeout(() => {
      dragHoldTimerRef.current = null;
      setDraggingSliderKey(key);
      setIsTransparentDrag(true);
    }, 140);
  };

  const handleSliderDragEnd = useCallback(() => {
    if (dragHoldTimerRef.current !== null) {
      window.clearTimeout(dragHoldTimerRef.current);
      dragHoldTimerRef.current = null;
    }
    if (dragReleaseTimerRef.current !== null) {
      window.clearTimeout(dragReleaseTimerRef.current);
    }
    dragReleaseTimerRef.current = window.setTimeout(() => {
      dragReleaseTimerRef.current = null;
      setIsTransparentDrag(false);
      setDraggingSliderKey(null);
    }, 120);
  }, []);

  // Convenient keyboard shortcuts when modals are closed: Space (Play/Pause), [ / ] / \ (Sync), F (Fullscreen)
  useEffect(() => {
    if (isModalOpen || isPickerOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space' && showControls && target?.tagName !== 'BUTTON') {
        e.preventDefault();
        void handleTogglePlayPause();
        return;
      }

      if (e.key === '[') {
        e.preventDefault();
        setSettings((prev) => {
          const nextOffset = stepSyncOffset(prev.syncOffset, -100);
          saveNumericSetting('syncOffset', nextOffset);
          showTemporarySyncFeedback(nextOffset);
          return { ...prev, syncOffset: nextOffset };
        });
        return;
      }

      if (e.key === ']') {
        e.preventDefault();
        setSettings((prev) => {
          const nextOffset = stepSyncOffset(prev.syncOffset, 100);
          saveNumericSetting('syncOffset', nextOffset);
          showTemporarySyncFeedback(nextOffset);
          return { ...prev, syncOffset: nextOffset };
        });
        return;
      }

      if (e.key === '\\') {
        e.preventDefault();
        saveNumericSetting('syncOffset', 0);
        setSettings((prev) => ({ ...prev, syncOffset: 0 }));
        showTemporarySyncFeedback(0);
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isModalOpen,
    isPickerOpen,
    showControls,
    handleTogglePlayPause,
    toggleFullscreen,
    showTemporarySyncFeedback,
  ]);

  const openSettingsModal = (preferredTab?: SettingsTab) => {
    setValidationError(null);
    if (preferredTab) {
      setModalInitialTab(preferredTab);
    } else if (status === 'initial_empty' || status === 'auth_error') {
      setModalInitialTab('spotify');
    } else {
      setModalInitialTab('display');
    }
    setIsModalOpen(true);
  };

  const isStackedVinylPlayer = Boolean(isVinylMode && !isMobileLandscape);
  const useMinimalHeaderBar = isDesktopSplitActive || isStackedVinylPlayer;

  return (
    <div
      ref={viewportRootRef}
      data-layout-morph={activeMorphDirection ?? undefined}
      className={`app-viewport-root relative isolate flex flex-col w-full overflow-clip bg-[var(--bg-page)] ${
        isIdleHidden ? 'cursor-none' : ''
      }`}
    >
      <AmbientBackdrop
        albumArtUrl={track?.albumArtUrl ?? null}
        ambientLightEnabled={settings.ambientLight}
        isPlaying={isPlaying}
      />

      <Header
        track={track}
        isDesktopSplitActive={useMinimalHeaderBar}
        activeMorphDirection={activeMorphDirection}
        hideSplitToggle={isVinylMode}
        isFullscreen={isFullscreen}
        isIdleHidden={isIdleHidden}
        splitLayout={settings.splitLayout}
        syncFeedback={syncFeedback}
        showControls={showControls}
        hideControls={settings.hideControls}
        isPlaying={isPlaying}
        isPreviewMode={isPreviewMode}
        durationMs={track?.durationMs ?? PREVIEW_DURATION_MS}
        progressAnchorMs={progressAnchorMs}
        anchorTimestamp={anchorTimestamp}
        onSeek={handleSeekLyric}
        onPrevious={handlePrevious}
        onPlayPause={handleTogglePlayPause}
        onNext={handleNext}
        onToggleSplitLayout={() =>
          handleUpdateBooleanSetting('splitLayout', !settings.splitLayout)
        }
        onOpenLyricPicker={() => setIsPickerOpen(true)}
        onToggleFullscreen={toggleFullscreen}
        onOpenSettings={() => openSettingsModal()}
      />

      <LyricsViewport
        status={status}
        track={track}
        lyrics={lyrics}
        isPlainLyrics={isPlainLyrics}
        lyricSource={lyricSource}
        isDesktopSplitActive={isDesktopSplitActive}
        isMorphingSplitTransition={isMorphingSplitTransition}
        isStackedVinylPlayer={isStackedVinylPlayer}
        showControls={showControls}
        isPlaying={isPlaying}
        isPreviewMode={isPreviewMode}
        isIdleHidden={isIdleHidden}
        progressAnchorMs={progressAnchorMs}
        anchorTimestamp={anchorTimestamp}
        settings={settings}
        draggingSliderKey={draggingSliderKey}
        onSeekLyric={handleSeekLyric}
        onPrevious={handlePrevious}
        onPlayPause={handleTogglePlayPause}
        onNext={handleNext}
        onOpenLyricPicker={() => setIsPickerOpen(true)}
        onOpenSettings={() => openSettingsModal('spotify')}
        onStartPreview={() => startPreviewMode()}
      />

      {!useMinimalHeaderBar && track && (
        <MediaControls
          variant="landscape-dock"
          visible={showControls}
          hiddenBySetting={settings.hideControls}
          isIdleHidden={isIdleHidden}
          isPlaying={isPlaying}
          isPreviewMode={isPreviewMode}
          durationMs={track.durationMs || PREVIEW_DURATION_MS}
          progressAnchorMs={progressAnchorMs}
          anchorTimestamp={anchorTimestamp}
          onSeek={handleSeekLyric}
          onPrevious={handlePrevious}
          onPlayPause={handleTogglePlayPause}
          onNext={handleNext}
        />
      )}

      <LyricPickerModal
        isOpen={isPickerOpen}
        track={track}
        initialCandidates={lyricCandidates}
        selectedCandidateId={selectedCandidateId}
        isVinylViewActive={status === 'lyrics_not_found'}
        onSelectCandidate={handleSelectCandidate}
        onSelectNoLyrics={handleSelectNoLyrics}
        onClose={() => setIsPickerOpen(false)}
      />

      <SettingsModal
        isOpen={isModalOpen}
        initialTab={modalInitialTab}
        viewerStatus={status}
        isPreviewMode={isPreviewMode}
        isPkceAuthorizing={isPkceAuthorizing}
        credentials={credentials}
        settings={settings}
        draggingSliderKey={draggingSliderKey}
        isTransparentDrag={isTransparentDrag}
        validationError={validationError}
        onClose={() => setIsModalOpen(false)}
        onStartPkceConnect={(cid) => void handleStartPkceConnect(cid)}
        onSaveAndConnect={handleSaveAndConnect}
        onDisconnectSpotify={handleDisconnectSpotify}
        onStartPreview={() => startPreviewMode()}
        onApplyPreset={handleApplyPreset}
        onStepSyncOffset={handleStepSyncOffset}
        onUpdateNumericSetting={handleUpdateNumericSetting}
        onUpdateBooleanSetting={handleUpdateBooleanSetting}
        onResetSingleSetting={handleResetSingleSetting}
        onResetDefaults={handleResetDefaults}
        onSliderDragStart={handleSliderDragStart}
        onSliderDragEnd={handleSliderDragEnd}
        onClearValidationError={() => setValidationError(null)}
      />
    </div>
  );
}
