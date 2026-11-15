import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import previewAlbumCover from './assets/images/preview_album_cover_1794683829452.jpg';
import { Header } from './components/Header';
import { LyricsViewport } from './components/LyricsViewport';
import { MediaControls } from './components/MediaControls';
import { SettingsModal } from './components/SettingsModal';
import { useWakeLock } from './hooks/useWakeLock';
import { searchLyricsOnLrcLib } from './services/lrclib';
import {
  SpotifyActionResult,
  fetchCurrentlyPlaying,
  refreshSpotifyAccessToken,
  sendSpotifyNext,
  sendSpotifyPlayPause,
  sendSpotifyPrevious,
  sendSpotifySeek,
} from './services/spotify';
import {
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
  PREVIEW_DURATION_MS,
  PREVIEW_LRC,
  UI_PRESETS,
  computeTrackProgressMs,
  parseLRC,
  parsePlainLyrics,
  stepSyncOffset,
} from './utils/lyrics';
import {
  applySettingsToDocumentCss,
  clearStoredCredentials,
  loadStoredCredentials,
  loadStoredUISettings,
  saveAllUISettings,
  saveBooleanSetting,
  saveNumericSetting,
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
    if (params.get('autostart') === '1') return false;
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

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [progressAnchorMs, setProgressAnchorMs] = useState<number>(0);
  const [anchorTimestamp, setAnchorTimestamp] = useState<number>(() => performance.now());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const accessTokenRef = useRef<string>('');
  const currentSongIdRef = useRef<string>('');
  const isPreviewRef = useRef<boolean>(false);
  const lyricsAbortRef = useRef<AbortController | null>(null);
  const dragReleaseTimerRef = useRef<number | null>(null);
  const syncFeedbackTimerRef = useRef<number | null>(null);

  useWakeLock(settings.keepAwake);

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

  // Track Fullscreen API state
  useEffect(() => {
    const syncFsState = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', syncFsState);
    document.addEventListener('webkitfullscreenchange', syncFsState);
    return () => {
      document.removeEventListener('fullscreenchange', syncFsState);
      document.removeEventListener('webkitfullscreenchange', syncFsState);
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

  const loadLyricsForTrack = useCallback(async (nextTrack: TrackMetadata) => {
    lyricsAbortRef.current?.abort();
    const controller = new AbortController();
    lyricsAbortRef.current = controller;

    setStatus('searching_lyrics');
    setLyrics([]);
    setLyricSource('');
    setIsPlainLyrics(false);

    const found = await searchLyricsOnLrcLib(
      nextTrack.title,
      nextTrack.artist,
      nextTrack.durationMs,
      controller.signal
    );

    if (controller.signal.aborted) return;

    if (found) {
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

      const result = await fetchCurrentlyPlaying(accessTokenRef.current);
      if (isPreviewRef.current) return;

      if (result.status === 'no_content') {
        setIsPlaying(false);
        // Preserve already-loaded track & lyrics if Spotify merely went idle while paused
        if (!currentSongIdRef.current) {
          setShowControls(false);
          setStatus('spotify_idle');
        }
        return;
      }

      if (result.status === 'unauthorized') {
        const refreshed = await refreshSpotifyAccessToken(credsForRefresh);
        if (refreshed) {
          accessTokenRef.current = refreshed;
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

      setShowControls(true);
      setIsPlaying(result.isPlaying);
      setProgressAnchorMs(result.progressMs);
      setAnchorTimestamp(performance.now());

      if (currentSongIdRef.current !== result.track.id) {
        currentSongIdRef.current = result.track.id;
        setTrack(result.track);
        void loadLyricsForTrack(result.track);
      } else {
        setTrack((prev) => prev ?? result.track);
      }
    },
    [loadLyricsForTrack]
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
        accessTokenRef.current = refreshed;
        const retry = await action(refreshed);
        return retry === 'ok';
      }
      return false;
    },
    [credentials]
  );

  const connectSpotify = useCallback(
    async (creds: SpotifyCredentials) => {
      lyricsAbortRef.current?.abort();
      isPreviewRef.current = false;
      setIsPreviewMode(false);
      currentSongIdRef.current = '';
      setTrack(null);
      setLyrics([]);
      setShowControls(false);
      setStatus('connecting');

      const token = await refreshSpotifyAccessToken(creds);
      if (!token) {
        accessTokenRef.current = '';
        setStatus('auth_error');
        setModalInitialTab('spotify');
        setIsModalOpen(true);
        return;
      }

      accessTokenRef.current = token;
      await pollSpotifyPlayback(creds);
    },
    [pollSpotifyPlayback]
  );

  const startPreviewMode = useCallback(() => {
    lyricsAbortRef.current?.abort();
    isPreviewRef.current = true;
    accessTokenRef.current = '';
    currentSongIdRef.current = PREVIEW_TRACK.id;

    setValidationError(null);
    setIsModalOpen(false);
    setModalInitialTab('display');
    setIsPreviewMode(true);
    setTrack(PREVIEW_TRACK);
    setIsPlainLyrics(false);
    setLyricSource('LRCLIB · 미리보기');
    setLyrics(parseLRC(PREVIEW_LRC));
    setStatus('lyrics_ready');
    setIsPlaying(true);
    setShowControls(true);
    setProgressAnchorMs(0);
    setAnchorTimestamp(performance.now());
  }, []);

  const handleDisconnectSpotify = useCallback(() => {
    lyricsAbortRef.current?.abort();
    clearStoredCredentials();
    accessTokenRef.current = '';
    currentSongIdRef.current = '';
    setCredentials({ clientId: '', clientSecret: '', refreshToken: '' });
    setValidationError(null);

    if (!isPreviewRef.current) {
      setIsPlaying(false);
      setShowControls(false);
      setTrack(null);
      setLyrics([]);
      setStatus('initial_empty');
    }
  }, []);

  // Initial boot: either ?autostart=1 preview or saved Spotify refresh token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startPreviewMode();
      return;
    }

    const saved = loadStoredCredentials();
    if (saved.clientId && saved.clientSecret && saved.refreshToken) {
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

    if (!trimmed.clientId || !trimmed.clientSecret || !trimmed.refreshToken) {
      setValidationError('Client ID, Client Secret, Refresh Token을 모두 입력해주세요');
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

  const handleUpdateBooleanSetting = (key: 'keepAwake' | 'hideControls', value: boolean) => {
    saveBooleanSetting(key, value);
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetDefaults = () => {
    saveAllUISettings(DEFAULT_UI_SETTINGS);
    setSettings({ ...DEFAULT_UI_SETTINGS });
  };

  const handleSliderDragStart = (key: NumericSettingKey) => {
    if (dragReleaseTimerRef.current !== null) {
      window.clearTimeout(dragReleaseTimerRef.current);
    }
    setDraggingSliderKey(key);
    setIsTransparentDrag(true);
  };

  const handleSliderDragEnd = useCallback(() => {
    if (dragReleaseTimerRef.current !== null) {
      window.clearTimeout(dragReleaseTimerRef.current);
    }
    dragReleaseTimerRef.current = window.setTimeout(() => {
      setIsTransparentDrag(false);
      setDraggingSliderKey(null);
    }, 150);
  }, []);

  // Convenient keyboard shortcuts when modal is closed: Space (Play/Pause), [ / ] / \ (Sync), F (Fullscreen)
  useEffect(() => {
    if (isModalOpen) return;

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
  }, [isModalOpen, showControls, handleTogglePlayPause, toggleFullscreen, showTemporarySyncFeedback]);

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

  const mediaControlsVisible =
    showControls && (!isModalOpen || draggingSliderKey === 'uiScale');

  return (
    <div className="relative isolate flex flex-col h-screen w-screen overflow-clip bg-[var(--bg-page)] pb-20">
      {/* Ambient Album Art Blurred Backdrop */}
      <div
        aria-hidden="true"
        style={{
          backgroundImage: track?.albumArtUrl ? `url('${track.albumArtUrl}')` : 'none',
        }}
        className={`pointer-events-none absolute -inset-[12%] bg-cover bg-center blur-[64px] brightness-[0.68] saturate-[1.65] z-0 transition-opacity duration-700 ${
          track?.albumArtUrl ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0f0f10]/35 via-[#0f0f10]/15 to-[#0f0f10]/65 z-0"
      />

      <Header
        track={track}
        isFullscreen={isFullscreen}
        syncFeedback={syncFeedback}
        onToggleFullscreen={toggleFullscreen}
        onOpenSettings={() => openSettingsModal()}
      />

      <LyricsViewport
        status={status}
        lyrics={lyrics}
        isPlainLyrics={isPlainLyrics}
        lyricSource={lyricSource}
        isPlaying={isPlaying}
        isPreviewMode={isPreviewMode}
        progressAnchorMs={progressAnchorMs}
        anchorTimestamp={anchorTimestamp}
        settings={settings}
        draggingSliderKey={draggingSliderKey}
        onSeekLyric={handleSeekLyric}
        onOpenSettings={() => openSettingsModal('spotify')}
        onStartPreview={startPreviewMode}
      />

      <MediaControls
        visible={mediaControlsVisible}
        hiddenBySetting={settings.hideControls}
        isPlaying={isPlaying}
        isPreviewMode={isPreviewMode}
        onPrevious={handlePrevious}
        onPlayPause={handleTogglePlayPause}
        onNext={handleNext}
      />

      <SettingsModal
        isOpen={isModalOpen}
        initialTab={modalInitialTab}
        viewerStatus={status}
        isPreviewMode={isPreviewMode}
        credentials={credentials}
        settings={settings}
        isTransparentDrag={isTransparentDrag}
        validationError={validationError}
        onClose={() => setIsModalOpen(false)}
        onSaveAndConnect={handleSaveAndConnect}
        onDisconnectSpotify={handleDisconnectSpotify}
        onStartPreview={startPreviewMode}
        onApplyPreset={handleApplyPreset}
        onStepSyncOffset={handleStepSyncOffset}
        onUpdateNumericSetting={handleUpdateNumericSetting}
        onUpdateBooleanSetting={handleUpdateBooleanSetting}
        onResetDefaults={handleResetDefaults}
        onSliderDragStart={handleSliderDragStart}
        onSliderDragEnd={handleSliderDragEnd}
        onClearValidationError={() => setValidationError(null)}
      />
    </div>
  );
}
