import { useEffect, useState } from 'react';
import {
  Columns2,
  Disc3,
  ListMusic,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
} from 'lucide-react';
import { TrackMetadata } from '../types/lyrics';
import { MarqueeText } from './MarqueeText';
import { MediaControls } from './MediaControls';

interface HeaderProps {
  track: TrackMetadata | null;
  isDesktopSplitActive: boolean;
  activeMorphDirection?: 'to-split' | 'to-single' | null;
  hideSplitToggle?: boolean;
  isFullscreen: boolean;
  isIdleHidden: boolean;
  splitLayout: boolean;
  syncFeedback: string | null;
  showControls: boolean;
  hideControls: boolean;
  isPlaying: boolean;
  isPreviewMode: boolean;
  durationMs: number;
  progressAnchorMs: number;
  anchorTimestamp: number;
  onSeek: (positionMs: number) => void;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onToggleSplitLayout: () => void;
  onOpenLyricPicker: () => void;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
}

export function Header({
  track,
  isDesktopSplitActive,
  activeMorphDirection = null,
  hideSplitToggle = false,
  isFullscreen,
  isIdleHidden,
  splitLayout,
  syncFeedback,
  showControls,
  hideControls,
  isPlaying,
  isPreviewMode,
  durationMs,
  progressAnchorMs,
  anchorTimestamp,
  onSeek,
  onPrevious,
  onPlayPause,
  onNext,
  onToggleSplitLayout,
  onOpenLyricPicker,
  onToggleFullscreen,
  onOpenSettings,
}: HeaderProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [exitingToSplit, setExitingToSplit] = useState(false);
  const [brandSoftEnter, setBrandSoftEnter] = useState(false);
  const [prevLayoutState, setPrevLayoutState] = useState<{
    trackId: string | null;
    isSplit: boolean;
    skipIdentityAnim: boolean;
  }>({
    trackId: track?.id ?? null,
    isSplit: isDesktopSplitActive,
    skipIdentityAnim: false,
  });

  const currentTrackId = track?.id ?? null;
  if (
    prevLayoutState.trackId !== currentTrackId ||
    prevLayoutState.isSplit !== isDesktopSplitActive
  ) {
    const toggledSplitOnSameTrack =
      prevLayoutState.trackId === currentTrackId &&
      prevLayoutState.isSplit !== isDesktopSplitActive;
    setPrevLayoutState({
      trackId: currentTrackId,
      isSplit: isDesktopSplitActive,
      skipIdentityAnim: toggledSplitOnSameTrack
        ? true
        : prevLayoutState.trackId !== currentTrackId
          ? false
          : prevLayoutState.skipIdentityAnim,
    });

    if (toggledSplitOnSameTrack && isDesktopSplitActive && activeMorphDirection === 'to-split') {
      setExitingToSplit(true);
      setBrandSoftEnter(false);
    } else {
      setExitingToSplit(false);
      setBrandSoftEnter(false);
    }
  } else if (exitingToSplit && (!isDesktopSplitActive || !track)) {
    setExitingToSplit(false);
  }

  useEffect(() => {
    if (!exitingToSplit) return undefined;
    const timer = window.setTimeout(() => {
      setExitingToSplit(false);
      setBrandSoftEnter(true);
    }, 205);
    return () => window.clearTimeout(timer);
  }, [exitingToSplit]);

  const identityEnterClass = prevLayoutState.skipIdentityAnim ? '' : 'header-identity-enter ';

  useEffect(() => {
    setImgFailed(false);
  }, [track?.albumArtUrl]);

  const renderInlineTrackChrome = Boolean(track && (!isDesktopSplitActive || exitingToSplit));
  const showInlineHeaderPlayer = Boolean(
    renderInlineTrackChrome && showControls && !hideControls
  );

  return (
    <header
      id="main-header"
      data-idle-hidden={isIdleHidden ? 'true' : 'false'}
      className={`header-shell hud-layer-pinned z-20 w-full max-w-6xl mx-auto shrink-0 px-4 sm:px-6 lg:px-8 ${
        showInlineHeaderPlayer
          ? 'header-inline-player'
          : 'header-default-bar flex items-center justify-between'
      }`}
    >
      {/* Zone 1: Track Identity (stationary in-place dissolve on Single -> Split; stationary reveal on Split -> Single) */}
      <div
        className={`flex items-center gap-3 min-w-0 ${
          showInlineHeaderPlayer ? 'header-zone-identity' : 'mr-4 flex-1'
        }`}
      >
        {renderInlineTrackChrome && track ? (
          <div
            key={track.id}
            data-testid="header-track-info"
            className={`${identityEnterClass}hud-layer-pinned flex items-center gap-2.5 sm:gap-3 min-w-0 w-full`}
          >
            {track.albumArtUrl && !imgFailed ? (
              <img
                src={track.albumArtUrl}
                alt={`${track.title} 앨범 아트`}
                data-morph-role="header-artwork"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className={`header-album-thumb w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover flex-none border border-[var(--border-hairline)] ${
                  exitingToSplit ? 'opacity-0 pointer-events-none' : ''
                }`}
              />
            ) : (
              <div
                aria-hidden="true"
                data-morph-role="header-artwork"
                className={`header-album-thumb w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[var(--bg-card)] border border-[var(--border-hairline)] flex items-center justify-center flex-none ${
                  exitingToSplit ? 'opacity-0 pointer-events-none' : ''
                }`}
              >
                <Disc3 size={18} strokeWidth={1.5} className="text-[var(--text-muted)]" />
              </div>
            )}
            <div
              data-morph-role="header-meta"
              className={`min-w-0 flex-1 ${exitingToSplit ? 'header-chrome-exiting' : ''}`}
            >
              <MarqueeText
                as="h1"
                text={track.title}
                testId="header-track-title"
                className="text-[14px] sm:text-[15px] font-semibold text-[var(--text-primary)] leading-5"
              />
              <MarqueeText
                as="p"
                text={track.artist}
                testId="header-track-artist"
                className="text-[12px] sm:text-[13px] font-normal text-[var(--text-secondary)] leading-4 sm:leading-5"
              />
            </div>
          </div>
        ) : (
          <span
            data-morph-role="header-brand"
            className={`${brandSoftEnter ? 'header-brand-soft-enter ' : identityEnterClass}hud-layer-pinned text-sm font-medium text-white/55 whitespace-nowrap shrink-0 transition-opacity duration-300 ${
              isIdleHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            Lyrictify
          </span>
        )}
      </div>

      {/* Zone 2: Inline Horizontal Progress Bar + Right Transport Buttons (in-place dissolve on Single -> Split) */}
      {showInlineHeaderPlayer && (
        <>
          <div
            aria-hidden="true"
            data-idle-hidden={isIdleHidden ? 'true' : 'false'}
            className="header-desktop-spacer"
          >
            <div className="header-spacer-inner">
              <div className="header-desktop-spacer-box" />
            </div>
          </div>
          <div className={`header-zone-player ${exitingToSplit ? 'header-chrome-exiting' : ''}`}>
            <MediaControls
              variant="header"
              visible={showControls}
              hiddenBySetting={hideControls}
              isIdleHidden={isIdleHidden}
              isPlaying={isPlaying}
              isPreviewMode={isPreviewMode}
              durationMs={durationMs}
              progressAnchorMs={progressAnchorMs}
              anchorTimestamp={anchorTimestamp}
              onSeek={onSeek}
              onPrevious={onPrevious}
              onPlayPause={onPlayPause}
              onNext={onNext}
            />
          </div>
        </>
      )}

      {/* Zone 3: Right-Side Utility Toolbar (bleed-safe shadows at rest + horizontal fade mask during inline collapse) */}
      <div
        data-testid="header-toolbar"
        data-idle-hidden={isIdleHidden ? 'true' : 'false'}
        className={`hud-layer-pinned flex-none ${
          showInlineHeaderPlayer
            ? 'header-zone-toolbar header-toolbar-inline-collapse'
            : `transition-opacity duration-300 ${
                isIdleHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`
        }`}
      >
        <div className={showInlineHeaderPlayer ? 'header-toolbar-clip' : ''}>
          <div
            className={
              showInlineHeaderPlayer
                ? `header-toolbar-row flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                    exitingToSplit ? 'border-transparent' : ''
                  }`
                : 'flex items-center gap-1.5 sm:gap-2'
            }
          >
            {syncFeedback && (
              <div
                key={syncFeedback}
                role="status"
                aria-live="polite"
                className="sync-toast-enter h-9 sm:h-10 px-3 rounded-lg surface-floating flex items-center font-mono-tech text-xs text-[var(--accent)] whitespace-nowrap"
              >
                {syncFeedback}
              </div>
            )}

            {renderInlineTrackChrome && (
              <button
                type="button"
                data-morph-role="header-lyric-picker"
                onClick={onOpenLyricPicker}
                aria-label="다른 가사 선택"
                title="다른 가사 선택 (LRCLIB)"
                className={`toolbar-icon-btn w-9 h-9 sm:w-10 sm:h-10 flex-none rounded-lg surface-floating text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] flex items-center justify-center shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--text-primary)] cursor-pointer ${
                  exitingToSplit ? 'header-chrome-exiting' : ''
                }`}
              >
                <ListMusic size={17} strokeWidth={1.5} />
              </button>
            )}

            {track && !hideSplitToggle && (
              <button
                type="button"
                onClick={onToggleSplitLayout}
                aria-label={splitLayout ? '기본 레이아웃으로 전환' : '분할 레이아웃으로 전환'}
                aria-pressed={splitLayout}
                title={splitLayout ? '기본 단독 가사 뷰로 전환' : '앨범 아트 분할 뷰로 전환'}
                className={`toolbar-icon-btn hidden lg:flex w-10 h-10 flex-none rounded-lg surface-floating items-center justify-center shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--text-primary)] cursor-pointer ${
                  splitLayout
                    ? 'text-[var(--accent)] border-[var(--accent)]/45'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)]'
                }`}
              >
                <Columns2 size={17} strokeWidth={1.5} />
              </button>
            )}

            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? '전체 화면 종료' : '전체 화면 전환'}
              title={isFullscreen ? '전체 화면 종료 (F)' : '전체 화면 전환 (F)'}
              className="toolbar-icon-btn w-9 h-9 sm:w-10 sm:h-10 flex-none rounded-lg surface-floating text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] flex items-center justify-center shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--text-primary)] cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize2 size={17} strokeWidth={1.5} />
              ) : (
                <Maximize2 size={17} strokeWidth={1.5} />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="설정 열기"
              title="설정 열기"
              className="toolbar-icon-btn w-9 h-9 sm:w-10 sm:h-10 flex-none rounded-lg surface-floating text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] flex items-center justify-center shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--text-primary)] cursor-pointer"
            >
              <SlidersHorizontal size={17} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
