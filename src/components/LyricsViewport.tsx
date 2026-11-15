import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Disc3 } from 'lucide-react';
import { LyricLine, NumericSettingKey, TrackMetadata, UISettings, ViewerStatus } from '../types/lyrics';
import {
  INTERLUDE_MIN_GAP_MS,
  computeInterludeState,
  computeLyricVisualStyle,
  computeTrackProgressMs,
  findActiveLyricIndex,
} from '../utils/lyrics';

interface LyricsViewportProps {
  status: ViewerStatus;
  track: TrackMetadata | null;
  lyrics: LyricLine[];
  isPlainLyrics: boolean;
  lyricSource: string;
  isPlaying: boolean;
  isPreviewMode: boolean;
  progressAnchorMs: number;
  anchorTimestamp: number;
  settings: UISettings;
  draggingSliderKey: NumericSettingKey | null;
  onSeekLyric: (timeMs: number) => void;
  onOpenLyricPicker: () => void;
  onOpenSettings: () => void;
  onStartPreview: () => void;
}

export function LyricsViewport({
  status,
  track,
  lyrics,
  isPlainLyrics,
  lyricSource,
  isPlaying,
  isPreviewMode,
  progressAnchorMs,
  anchorTimestamp,
  settings,
  draggingSliderKey,
  onSeekLyric,
  onOpenLyricPicker,
  onOpenSettings,
  onStartPreview,
}: LyricsViewportProps) {
  const wrapperRef = useRef<HTMLElement | null>(null);
  const manualScrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const wrapElsRef = useRef<Array<HTMLDivElement | null>>([]);
  const lineElsRef = useRef<Array<HTMLElement | null>>([]);
  const introWrapRef = useRef<HTMLDivElement | null>(null);
  const interludeSlotRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [splitImgFailed, setSplitImgFailed] = useState(false);

  useEffect(() => {
    setSplitImgFailed(false);
  }, [track?.albumArtUrl]);

  // Identify indices that precede a >= 10s instrumental interlude (or >= 10s intro at -1)
  const interludeGapIndices = useMemo(() => {
    const indices = new Set<number>();
    if (isPlainLyrics || lyrics.length === 0) return indices;
    if (lyrics[0].time >= INTERLUDE_MIN_GAP_MS) {
      indices.add(-1);
    }
    for (let i = 0; i < lyrics.length - 1; i++) {
      if (lyrics[i + 1].time - lyrics[i].time >= INTERLUDE_MIN_GAP_MS) {
        indices.add(i);
      }
    }
    return indices;
  }, [lyrics, isPlainLyrics]);

  const playbackRef = useRef({
    isPlaying,
    isPreviewMode,
    progressAnchorMs,
    anchorTimestamp,
  });
  const lastRawProgressRef = useRef<number>(0);
  const lastInterludeKeyRef = useRef<string>('');

  const settingsRef = useRef(settings);
  const lyricsRef = useRef(lyrics);
  const isPlainRef = useRef(isPlainLyrics);
  const draggingKeyRef = useRef(draggingSliderKey);

  const activeIndexRef = useRef<number>(-1);
  const isManualScrollingRef = useRef<boolean>(false);
  const manualScrollTimerRef = useRef<number | null>(null);
  const targetManualOffsetRef = useRef<number>(0);
  const manualOffsetRef = useRef<number>(0);
  const plainScrollYRef = useRef<number>(0);
  const lastManualTransformRef = useRef<string>('translateY(0px)');
  const isTouchDraggingRef = useRef<boolean>(false);
  const touchStartYRef = useRef<number>(0);
  const touchStartBaseRef = useRef<number>(0);

  settingsRef.current = settings;
  lyricsRef.current = lyrics;
  isPlainRef.current = isPlainLyrics;
  draggingKeyRef.current = draggingSliderKey;

  useEffect(() => {
    playbackRef.current = {
      isPlaying,
      isPreviewMode,
      progressAnchorMs,
      anchorTimestamp,
    };
  }, [isPlaying, isPreviewMode, progressAnchorMs, anchorTimestamp]);

  const applyLineVisualStyles = useCallback((activeIdx: number) => {
    const currentSettings = settingsRef.current;
    const plain = isPlainRef.current;
    const draggingKey = draggingKeyRef.current;
    const forceClearBlur =
      isManualScrollingRef.current || (draggingKey !== null && draggingKey !== 'blurAmount');

    const lines = lineElsRef.current;
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (!el) continue;

      const isFarOffscreen =
        !plain &&
        !forceClearBlur &&
        (activeIdx === -1 ? i > 14 : Math.abs(i - activeIdx) > 9);

      let blurPx = 0;
      let opacity = 0;
      let isActive = false;

      if (!isFarOffscreen) {
        const computed = computeLyricVisualStyle(i, activeIdx, {
          isPlainLyrics: plain,
          forceClearBlur,
          blurIntensity: currentSettings.blurAmount,
        });
        blurPx = computed.blurPx;
        opacity = computed.opacity;
        isActive = computed.isActive;
      }

      const nextFilter = blurPx <= 0.05 ? 'none' : `blur(${blurPx}px)`;
      const nextOpacity = String(opacity);

      if (el.style.filter !== nextFilter) {
        el.style.filter = nextFilter;
      }
      if (el.style.opacity !== nextOpacity) {
        el.style.opacity = nextOpacity;
      }
      if (isActive) {
        if (!el.classList.contains('active')) el.classList.add('active');
      } else if (el.classList.contains('active')) {
        el.classList.remove('active');
      }
    }

    if (contentRef.current) {
      contentRef.current.dataset.activeLyricIndex = String(activeIdx);
    }
  }, []);

  const getCollapsingInterludeHeightAbove = useCallback((targetLineIndex: number): number => {
    let extraPx = 0;
    interludeSlotRefs.current.forEach((slotEl, slotKey) => {
      if (slotKey < targetLineIndex && slotEl.dataset.active !== 'true' && slotEl.offsetHeight > 0) {
        extraPx += slotEl.offsetHeight;
      }
    });
    return extraPx;
  }, []);

  const updateInterludeDom = useCallback((estimatedProgressMs: number, currentlyPlaying: boolean) => {
    const interlude = computeInterludeState(
      lyricsRef.current,
      activeIndexRef.current,
      estimatedProgressMs,
      isPlainRef.current
    );

    const playTag = currentlyPlaying ? 'play' : 'pause';
    const stateKey = interlude.active ? `on:${interlude.afterLineIndex}:${playTag}` : `off:${playTag}`;

    if (stateKey === lastInterludeKeyRef.current) return;
    lastInterludeKeyRef.current = stateKey;

    interludeSlotRefs.current.forEach((slotEl, slotKey) => {
      const isThisActive = interlude.active && slotKey === interlude.afterLineIndex;
      slotEl.dataset.active = isThisActive ? 'true' : 'false';
      slotEl.dataset.playing = currentlyPlaying ? 'true' : 'false';
    });
  }, []);

  const alignLinesImmediately = useCallback(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    if (lyricsRef.current.length === 0) {
      content.style.paddingTop = '0px';
      return;
    }

    const vertRatio = settingsRef.current.vertPos / 100;
    content.style.paddingTop = `${wrapper.clientHeight * vertRatio}px`;

    if (!isPlainRef.current && activeIndexRef.current !== -1) {
      const activeIdx = activeIndexRef.current;
      const activeWrap = wrapElsRef.current[activeIdx];
      if (activeWrap) {
        const restingOffsetTop =
          activeWrap.offsetTop - getCollapsingInterludeHeightAbove(activeIdx);
        const lineEl = lineElsRef.current[activeIdx];
        const anchorHeight = lineEl ? lineEl.clientHeight : activeWrap.clientHeight;
        const translateY = restingOffsetTop - wrapper.clientHeight * vertRatio + anchorHeight / 2;
        if (introWrapRef.current) {
          introWrapRef.current.style.setProperty('--delay', '0s');
          introWrapRef.current.style.transform = `translateY(-${translateY}px)`;
        }
        for (const wrap of wrapElsRef.current) {
          if (!wrap) continue;
          wrap.style.setProperty('--delay', '0s');
          wrap.style.transform = `translateY(-${translateY}px)`;
        }
      }
    }
  }, [getCollapsingInterludeHeightAbove]);

  useLayoutEffect(() => {
    wrapElsRef.current = wrapElsRef.current.slice(0, lyrics.length);
    lineElsRef.current = lineElsRef.current.slice(0, lyrics.length);
    activeIndexRef.current = -1;
    lastInterludeKeyRef.current = '';
    targetManualOffsetRef.current = 0;
    manualOffsetRef.current = 0;
    plainScrollYRef.current = 0;
    isManualScrollingRef.current = false;

    if (manualScrollRef.current) {
      manualScrollRef.current.style.transform = 'translateY(0px)';
      lastManualTransformRef.current = 'translateY(0px)';
    }
    if (introWrapRef.current) {
      introWrapRef.current.style.setProperty('--delay', '0s');
      introWrapRef.current.style.transform = 'translateY(0px)';
    }
    for (const wrap of wrapElsRef.current) {
      if (wrap) {
        wrap.style.setProperty('--delay', '0s');
        wrap.style.transform = 'translateY(0px)';
      }
    }

    alignLinesImmediately();
    applyLineVisualStyles(-1);
  }, [lyrics, isPlainLyrics, status, alignLinesImmediately, applyLineVisualStyles]);

  useLayoutEffect(() => {
    alignLinesImmediately();
    applyLineVisualStyles(activeIndexRef.current);
  }, [
    settings.vertPos,
    settings.fontSize,
    settings.lineHeight,
    settings.margin,
    settings.blurAmount,
    settings.splitLayout,
    draggingSliderKey,
    alignLinesImmediately,
    applyLineVisualStyles,
  ]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content || typeof ResizeObserver === 'undefined') {
      const onResize = () => alignLinesImmediately();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    const observer = new ResizeObserver(() => {
      alignLinesImmediately();
    });
    observer.observe(wrapper);
    observer.observe(content);
    return () => observer.disconnect();
  }, [status, settings.splitLayout, alignLinesImmediately]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const activateManualScroll = () => {
      if (!isManualScrollingRef.current) {
        isManualScrollingRef.current = true;
        applyLineVisualStyles(activeIndexRef.current);
      }
      if (manualScrollTimerRef.current !== null) {
        window.clearTimeout(manualScrollTimerRef.current);
      }
      manualScrollTimerRef.current = window.setTimeout(() => {
        isManualScrollingRef.current = false;
        applyLineVisualStyles(activeIndexRef.current);
      }, 3000);
    };

    const onWheel = (e: WheelEvent) => {
      if (lyricsRef.current.length === 0) return;
      e.preventDefault();
      if (isPlainRef.current) {
        plainScrollYRef.current = Math.max(0, plainScrollYRef.current + e.deltaY);
      } else {
        targetManualOffsetRef.current += e.deltaY;
      }
      activateManualScroll();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (lyricsRef.current.length === 0 || e.touches.length === 0) return;
      touchStartYRef.current = e.touches[0].clientY;
      touchStartBaseRef.current = isPlainRef.current
        ? plainScrollYRef.current
        : targetManualOffsetRef.current;
      isTouchDraggingRef.current = false;
      activateManualScroll();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isManualScrollingRef.current || e.touches.length === 0) return;
      const deltaY = touchStartYRef.current - e.touches[0].clientY;
      if (Math.abs(deltaY) > 10) {
        isTouchDraggingRef.current = true;
        e.preventDefault();
      }
      if (isPlainRef.current) {
        plainScrollYRef.current = Math.max(0, touchStartBaseRef.current + deltaY);
      } else {
        targetManualOffsetRef.current = touchStartBaseRef.current + deltaY;
      }
      activateManualScroll();
    };

    wrapper.addEventListener('wheel', onWheel, { passive: false });
    wrapper.addEventListener('touchstart', onTouchStart, { passive: true });
    wrapper.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      wrapper.removeEventListener('wheel', onWheel);
      wrapper.removeEventListener('touchstart', onTouchStart);
      wrapper.removeEventListener('touchmove', onTouchMove);
      if (manualScrollTimerRef.current !== null) {
        window.clearTimeout(manualScrollTimerRef.current);
      }
    };
  }, [applyLineVisualStyles]);

  useEffect(() => {
    let rafId = 0;
    let lastFrameTime = performance.now();

    const tick = () => {
      const now = performance.now();
      let deltaTime = now - lastFrameTime;
      if (deltaTime > 100) deltaTime = 16;
      lastFrameTime = now;

      const currentLyrics = lyricsRef.current;
      const currentSettings = settingsRef.current;
      const pb = playbackRef.current;

      if (isPlainRef.current) {
        if (pb.isPlaying && !isManualScrollingRef.current && currentLyrics.length > 0) {
          plainScrollYRef.current += currentSettings.plainSpeed * (deltaTime / 1000);
        }
        const roundedPlain = Math.round(plainScrollYRef.current * 100) / 100;
        const nextTransform = `translateY(${-roundedPlain}px)`;
        if (manualScrollRef.current && lastManualTransformRef.current !== nextTransform) {
          manualScrollRef.current.style.transform = nextTransform;
          lastManualTransformRef.current = nextTransform;
        }
      } else {
        if (!isManualScrollingRef.current && Math.abs(targetManualOffsetRef.current) > 0.5) {
          targetManualOffsetRef.current += (0 - targetManualOffsetRef.current) * 0.05;
        } else if (!isManualScrollingRef.current) {
          targetManualOffsetRef.current = 0;
        }

        manualOffsetRef.current +=
          (targetManualOffsetRef.current - manualOffsetRef.current) * 0.12;
        if (Math.abs(manualOffsetRef.current) < 0.08 && targetManualOffsetRef.current === 0) {
          manualOffsetRef.current = 0;
        }

        const roundedManual = Math.round(manualOffsetRef.current * 100) / 100;
        const nextTransform = `translateY(${-roundedManual}px)`;
        if (manualScrollRef.current && lastManualTransformRef.current !== nextTransform) {
          manualScrollRef.current.style.transform = nextTransform;
          lastManualTransformRef.current = nextTransform;
        }

        if (currentLyrics.length > 0) {
          const rawTrackProgress = computeTrackProgressMs(
            pb.progressAnchorMs,
            pb.anchorTimestamp,
            now,
            pb.isPlaying,
            pb.isPreviewMode
          );

          const didLoopWrap =
            pb.isPreviewMode && rawTrackProgress < lastRawProgressRef.current - 1500;
          lastRawProgressRef.current = rawTrackProgress;

          if (didLoopWrap) {
            activeIndexRef.current = -1;
            if (introWrapRef.current) {
              introWrapRef.current.style.setProperty('--delay', '0s');
              introWrapRef.current.style.transform = 'translateY(0px)';
            }
            for (const wrap of wrapElsRef.current) {
              if (wrap) {
                wrap.style.setProperty('--delay', '0s');
                wrap.style.transform = 'translateY(0px)';
              }
            }
            applyLineVisualStyles(-1);
          }

          const estimatedProgress = rawTrackProgress + currentSettings.syncOffset;
          const newActiveIndex = findActiveLyricIndex(currentLyrics, estimatedProgress);

          if (newActiveIndex !== activeIndexRef.current) {
            if (newActiveIndex === -1) {
              activeIndexRef.current = -1;
              if (introWrapRef.current) {
                introWrapRef.current.style.setProperty('--delay', '0s');
                introWrapRef.current.style.transform = 'translateY(0px)';
              }
              for (const wrap of wrapElsRef.current) {
                if (wrap) {
                  wrap.style.setProperty('--delay', '0s');
                  wrap.style.transform = 'translateY(0px)';
                }
              }
              applyLineVisualStyles(-1);
            } else {
              const isJump =
                activeIndexRef.current !== -1 &&
                Math.abs(newActiveIndex - activeIndexRef.current) > 2;
              activeIndexRef.current = newActiveIndex;

              const activeWrap = wrapElsRef.current[newActiveIndex];
              const wrapper = wrapperRef.current;
              if (activeWrap && wrapper) {
                applyLineVisualStyles(newActiveIndex);
                // Update interlude DOM first so any slot above newActiveIndex marks data-active="false"
                updateInterludeDom(estimatedProgress, pb.isPlaying);

                const restingOffsetTop =
                  activeWrap.offsetTop - getCollapsingInterludeHeightAbove(newActiveIndex);
                const lineEl = lineElsRef.current[newActiveIndex];
                const elementCenter = (lineEl ? lineEl.clientHeight : activeWrap.clientHeight) / 2;
                const targetCenter = wrapper.clientHeight * (currentSettings.vertPos / 100);
                const translateY = restingOffsetTop - targetCenter + elementCenter;

                if (introWrapRef.current) {
                  introWrapRef.current.style.setProperty('--delay', '0s');
                  introWrapRef.current.style.transform = `translateY(-${translateY}px)`;
                }

                const wraps = wrapElsRef.current;
                for (let idx = 0; idx < wraps.length; idx++) {
                  const wrap = wraps[idx];
                  if (!wrap) continue;
                  if (isJump) {
                    wrap.style.setProperty('--delay', '0s');
                  } else {
                    const distance = Math.abs(idx - newActiveIndex);
                    const delay = Math.min(distance, 15) * currentSettings.waveDelay;
                    wrap.style.setProperty('--delay', `${delay}s`);
                  }
                  wrap.style.transform = `translateY(-${translateY}px)`;
                }
              }
            }
          }

          updateInterludeDom(estimatedProgress, pb.isPlaying);
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [applyLineVisualStyles, getCollapsingInterludeHeightAbove, updateInterludeDom]);

  const handleLineClick = (timeMs: number) => {
    if (isTouchDraggingRef.current || isPlainLyrics) return;
    if (wrapperRef.current) {
      wrapperRef.current.scrollTop = 0;
    }
    targetManualOffsetRef.current = 0;
    isManualScrollingRef.current = false;
    onSeekLyric(timeMs);
    applyLineVisualStyles(activeIndexRef.current);
  };

  const registerInterludeRef = (afterIdx: number) => (el: HTMLDivElement | null) => {
    if (el) {
      interludeSlotRefs.current.set(afterIdx, el);
    } else {
      interludeSlotRefs.current.delete(afterIdx);
    }
  };

  const showSplitArtworkPanel = Boolean(settings.splitLayout && track);

  return (
    <div className="relative z-10 flex-1 min-h-0 w-full max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center lg:gap-12 px-6 sm:px-12">
      {/* Wide-Screen Dual Split View Left Artwork Panel */}
      {showSplitArtworkPanel && track && (
        <aside
          aria-label="현재 재생 트랙 정보"
          data-testid="split-view-artwork-panel"
          className="relative z-20 hidden lg:flex lg:flex-col lg:w-[320px] xl:w-[360px] shrink-0 justify-center pb-14 select-none"
        >
          {track.albumArtUrl && !splitImgFailed ? (
            <img
              src={track.albumArtUrl}
              alt={`${track.title} 앨범 커버`}
              referrerPolicy="no-referrer"
              onError={() => setSplitImgFailed(true)}
              className="w-72 h-72 xl:w-80 xl:h-80 rounded-2xl object-cover border border-[var(--border-hairline)] shadow-2xl"
            />
          ) : (
            <div className="w-72 h-72 xl:w-80 xl:h-80 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-hairline)] flex items-center justify-center">
              <Disc3 size={48} strokeWidth={1.5} className="text-[var(--text-muted)]" />
            </div>
          )}

          <div className="mt-6 space-y-1.5 max-w-80">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] leading-snug break-keep">
              {track.title}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] truncate">{track.artist}</p>
          </div>

          {lyricSource && (
            <div className="mt-4 flex items-center gap-2.5 text-xs text-[var(--text-muted)]">
              <span className="font-mono-tech">출처 · {lyricSource}</span>
              <button
                type="button"
                onClick={onOpenLyricPicker}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-4 cursor-pointer"
              >
                가사 변경
              </button>
            </div>
          )}
        </aside>
      )}

      {/* Synced Lyrics Viewport (generous horizontal padding + matching negative margin prevents mask-image border-box from clipping Gaussian blur halos) */}
      <main
        ref={wrapperRef}
        id="lyrics-wrapper"
        onScroll={(e) => {
          if (e.currentTarget.scrollTop !== 0) {
            e.currentTarget.scrollTop = 0;
          }
        }}
        className={`lyrics-mask relative z-10 flex-1 min-h-0 h-full overflow-y-clip overflow-x-visible ${
          showSplitArtworkPanel
            ? '-mx-8 px-8 lg:-ml-14 lg:pl-16 lg:-mr-10 lg:pr-10'
            : '-mx-8 px-8 sm:-mx-6 sm:px-12 md:-mx-4 md:px-16'
        }`}
      >
        {status === 'lyrics_ready' && lyrics.length > 0 ? (
          <div
            ref={manualScrollRef}
            id="manual-scroll-container"
            className="w-full"
          >
            <div
              ref={contentRef}
              id="lyrics-content"
              data-status={status}
              data-active-lyric-index="-1"
              className="relative w-full flex flex-col pb-[50vh]"
            >
              {interludeGapIndices.has(-1) && (
                <div ref={introWrapRef} className="lyric-line-wrapper">
                  <div
                    ref={registerInterludeRef(-1)}
                    data-testid="interlude-indicator"
                    data-interlude-after="-1"
                    data-active="false"
                    data-playing={isPlaying ? 'true' : 'false'}
                    aria-hidden="true"
                    className="interlude-slot"
                  >
                    <div className="interlude-slot-clip">
                      <div className="interlude-slot-inner">
                        <div className="interlude-dots-stage">
                          <span className="interlude-dot" />
                          <span className="interlude-dot" />
                          <span className="interlude-dot" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {lyrics.map((lyric, index) => (
                <div
                  key={`${index}-${lyric.time}`}
                  ref={(el) => {
                    wrapElsRef.current[index] = el;
                  }}
                  className="lyric-line-wrapper"
                >
                  {isPlainLyrics ? (
                    <div
                      ref={(el) => {
                        lineElsRef.current[index] = el;
                      }}
                      className="lyric-line"
                    >
                      {lyric.text}
                    </div>
                  ) : (
                    <button
                      type="button"
                      ref={(el) => {
                        lineElsRef.current[index] = el;
                      }}
                      onClick={() => handleLineClick(lyric.time)}
                      className="lyric-line cursor-pointer bg-transparent border-0 p-0 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--text-primary)] rounded-lg"
                    >
                      {lyric.text}
                    </button>
                  )}

                  {interludeGapIndices.has(index) && (
                    <div
                      ref={registerInterludeRef(index)}
                      data-testid="interlude-indicator"
                      data-interlude-after={String(index)}
                      data-active="false"
                      data-playing={isPlaying ? 'true' : 'false'}
                      aria-hidden="true"
                      className="interlude-slot"
                    >
                      <div className="interlude-slot-clip">
                        <div className="interlude-slot-inner">
                          <div className="interlude-dots-stage">
                            <span className="interlude-dot" />
                            <span className="interlude-dot" />
                            <span className="interlude-dot" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center gap-3 mt-16 mb-[32vh]">
                {lyricSource && (
                  <span className="font-mono-tech text-xs text-[var(--text-muted)]">
                    출처 · {lyricSource}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onOpenLyricPicker}
                  className="h-7 px-2.5 rounded-[6px] bg-[var(--bg-raised)]/80 border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150 cursor-pointer"
                >
                  다른 가사 선택
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={contentRef}
            id="lyrics-content"
            data-status={status}
            data-active-lyric-index="-1"
            className="h-full flex flex-col justify-center items-start max-w-lg pb-12"
          >
            {status === 'connecting' && (
              <p className="text-xl sm:text-2xl font-medium text-[var(--text-secondary)]">
                Spotify 연결 중
              </p>
            )}

            {status === 'searching_lyrics' && (
              <p className="text-xl sm:text-2xl font-medium text-[var(--text-secondary)]">
                LRCLIB에서 가사를 찾는 중
              </p>
            )}

            {status === 'lyrics_not_found' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xl sm:text-2xl font-medium text-[var(--text-primary)]">
                    등록된 가사가 없습니다
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    직접 제목을 바꾸어 LRCLIB 후보를 검색하거나 다른 곡을 재생해보세요
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenLyricPicker}
                  className="h-9 px-4 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] hover:bg-[#2c2c2f] active:scale-[0.97] transition-[background-color,transform] duration-150 cursor-pointer"
                >
                  직접 가사 검색
                </button>
              </div>
            )}

            {status === 'auth_error' && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xl sm:text-2xl font-medium text-[#e5484d]">
                    Spotify 인증을 확인해주세요
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Client ID로 다시 연결하거나 수동 토큰 값을 점검해주세요
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="h-10 px-4 rounded-lg bg-[var(--text-primary)] text-[var(--bg-deepest)] font-medium text-sm hover:opacity-90 active:scale-[0.97] transition-[opacity,transform] duration-150 cursor-pointer whitespace-nowrap"
                  >
                    인증 정보 수정
                  </button>
                  <button
                    type="button"
                    onClick={onStartPreview}
                    className="h-10 px-4 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-hairline)] text-[var(--text-primary)] font-normal text-sm hover:bg-[#2c2c2f] active:scale-[0.97] transition-[background-color,transform] duration-150 cursor-pointer whitespace-nowrap"
                  >
                    UI 미리보기
                  </button>
                </div>
              </div>
            )}

            {status === 'spotify_idle' && (
              <div className="space-y-2">
                <p className="text-xl sm:text-2xl font-medium text-[var(--text-primary)]">
                  재생 중인 곡 없음
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  Spotify 앱에서 음악을 재생하면 가사가 자동으로 동기화됩니다
                </p>
              </div>
            )}

            {status === 'initial_empty' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-medium text-[var(--text-primary)] leading-tight break-keep">
                    재생 중인 곡의 싱크 가사를 화면 가득 띄웁니다
                  </h2>
                  <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed break-keep">
                    Spotify 계정을 원클릭으로 연결하거나 미리보기로 가사 흐름을 먼저 살펴보세요
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onStartPreview}
                    className="h-10 px-4 rounded-lg bg-[var(--text-primary)] text-[var(--bg-deepest)] font-medium text-sm hover:opacity-90 active:scale-[0.97] transition-[opacity,transform] duration-150 cursor-pointer whitespace-nowrap"
                  >
                    UI 미리보기 시작
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="h-10 px-4 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-hairline)] text-[var(--text-primary)] font-normal text-sm hover:bg-[#2c2c2f] active:scale-[0.97] transition-[background-color,transform] duration-150 cursor-pointer whitespace-nowrap"
                  >
                    계정 연결 설정
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
