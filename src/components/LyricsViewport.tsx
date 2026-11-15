import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { LyricLine, NumericSettingKey, UISettings, ViewerStatus } from '../types/lyrics';
import {
  computeLyricVisualStyle,
  computeTrackProgressMs,
  findActiveLyricIndex,
} from '../utils/lyrics';

interface LyricsViewportProps {
  status: ViewerStatus;
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
  onOpenSettings: () => void;
  onStartPreview: () => void;
}

export function LyricsViewport({
  status,
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
  onOpenSettings,
  onStartPreview,
}: LyricsViewportProps) {
  const wrapperRef = useRef<HTMLElement | null>(null);
  const manualScrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const wrapElsRef = useRef<Array<HTMLDivElement | null>>([]);
  const lineElsRef = useRef<Array<HTMLElement | null>>([]);

  const playbackRef = useRef({
    isPlaying,
    isPreviewMode,
    progressAnchorMs,
    anchorTimestamp,
  });
  const lastRawProgressRef = useRef<number>(0);

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
      const { blurPx, opacity, isActive } = computeLyricVisualStyle(i, activeIdx, {
        isPlainLyrics: plain,
        forceClearBlur,
        blurIntensity: currentSettings.blurAmount,
      });
      el.style.filter = `blur(${blurPx}px)`;
      el.style.opacity = String(opacity);
      if (isActive) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }

    if (contentRef.current) {
      contentRef.current.dataset.activeLyricIndex = String(activeIdx);
    }
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
      const activeWrap = wrapElsRef.current[activeIndexRef.current];
      if (activeWrap) {
        const translateY =
          activeWrap.offsetTop - wrapper.clientHeight * vertRatio + activeWrap.clientHeight / 2;
        for (const wrap of wrapElsRef.current) {
          if (!wrap) continue;
          wrap.style.setProperty('--delay', '0s');
          wrap.style.transform = `translateY(-${translateY}px)`;
        }
      }
    }
  }, []);

  useLayoutEffect(() => {
    wrapElsRef.current = wrapElsRef.current.slice(0, lyrics.length);
    lineElsRef.current = lineElsRef.current.slice(0, lyrics.length);
    activeIndexRef.current = -1;
    targetManualOffsetRef.current = 0;
    manualOffsetRef.current = 0;
    plainScrollYRef.current = 0;
    isManualScrollingRef.current = false;

    if (manualScrollRef.current) {
      manualScrollRef.current.style.transform = 'translateY(0px)';
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
  }, [status, alignLinesImmediately]);

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
        if (manualScrollRef.current) {
          manualScrollRef.current.style.transform = `translateY(-${plainScrollYRef.current}px)`;
        }
      } else {
        if (!isManualScrollingRef.current && Math.abs(targetManualOffsetRef.current) > 0.5) {
          targetManualOffsetRef.current += (0 - targetManualOffsetRef.current) * 0.05;
        } else if (!isManualScrollingRef.current) {
          targetManualOffsetRef.current = 0;
        }

        manualOffsetRef.current +=
          (targetManualOffsetRef.current - manualOffsetRef.current) * 0.12;

        if (manualScrollRef.current) {
          manualScrollRef.current.style.transform = `translateY(-${manualOffsetRef.current}px)`;
        }

        if (currentLyrics.length > 0) {
          const rawTrackProgress = computeTrackProgressMs(
            pb.progressAnchorMs,
            pb.anchorTimestamp,
            now,
            pb.isPlaying,
            pb.isPreviewMode
          );

          // Detect loop wrap-around in preview mode (45s -> 0s)
          const didLoopWrap =
            pb.isPreviewMode && rawTrackProgress < lastRawProgressRef.current - 1500;
          lastRawProgressRef.current = rawTrackProgress;

          if (didLoopWrap) {
            activeIndexRef.current = -1;
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

                const offsetTop = activeWrap.offsetTop;
                const elementCenter = activeWrap.clientHeight / 2;
                const targetCenter = wrapper.clientHeight * (currentSettings.vertPos / 100);
                const translateY = offsetTop - targetCenter + elementCenter;

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
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [applyLineVisualStyles]);

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

  return (
    <main
      ref={wrapperRef}
      id="lyrics-wrapper"
      onScroll={(e) => {
        if (e.currentTarget.scrollTop !== 0) {
          e.currentTarget.scrollTop = 0;
        }
      }}
      className="lyrics-mask relative z-10 flex-1 min-h-0 overflow-clip px-6 sm:px-16 md:px-24 w-full max-w-5xl mx-auto"
    >
      {status === 'lyrics_ready' && lyrics.length > 0 ? (
        <div
          ref={manualScrollRef}
          id="manual-scroll-container"
          className="w-full will-change-transform"
        >
          <div
            ref={contentRef}
            id="lyrics-content"
            data-status={status}
            data-active-lyric-index="-1"
            className="relative w-full flex flex-col pb-[50vh]"
          >
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
              </div>
            ))}
            {lyricSource && (
              <div className="font-mono-tech text-xs text-[var(--text-muted)] mt-16 mb-[32vh]">
                출처 · {lyricSource}
              </div>
            )}
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
            <div className="space-y-2">
              <p className="text-xl sm:text-2xl font-medium text-[var(--text-primary)]">
                등록된 가사가 없습니다
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                다른 곡을 재생하면 자동으로 다시 탐색합니다
              </p>
            </div>
          )}

          {status === 'auth_error' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xl sm:text-2xl font-medium text-[#e5484d]">
                  Spotify 인증을 확인해주세요
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  Client ID, Client Secret, Refresh Token 값이 일치하는지 점검해주세요
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
                  Spotify 계정을 연결하거나 미리보기로 가사 흐름과 싱크 조절을 먼저 살펴보세요
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
  );
}
