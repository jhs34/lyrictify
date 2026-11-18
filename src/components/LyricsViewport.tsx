import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Disc3, ListMusic } from 'lucide-react';
import { usePresenceTransition } from '../hooks/usePresenceTransition';
import { LyricLine, NumericSettingKey, TrackMetadata, UISettings, ViewerStatus } from '../types/lyrics';
import { MarqueeText } from './MarqueeText';
import { MediaControls } from './MediaControls';
import { VinylSleeveShowcase } from './VinylSleeveShowcase';
import {
  INTERLUDE_MIN_GAP_MS,
  LAYOUT_MORPH_DURATION_MS,
  LYRIC_LINE_DEACTIVATE_DURATION_MS,
  LYRIC_WAVE_RAMP_IN_MS,
  LyricWordToken,
  SPLIT_ASIDE_EXIT_DURATION_MS,
  WordVisualPosition,
  buildWordEntranceSpec,
  buildWordWaveSpec,
  computeInterludeState,
  computeLyricVisualStyle,
  computeTrackProgressMs,
  computeWordVisualPositions,
  findActiveLyricIndex,
  tokenizeLyricWords,
} from '../utils/lyrics';
import { applySettingsToDocumentCss } from '../utils/storage';

interface LyricsViewportProps {
  status: ViewerStatus;
  track: TrackMetadata | null;
  lyrics: LyricLine[];
  isPlainLyrics: boolean;
  lyricSource: string;
  isDesktopSplitActive: boolean;
  isMorphingSplitTransition?: boolean;
  isStackedVinylPlayer: boolean;
  showControls: boolean;
  isPlaying: boolean;
  isPreviewMode: boolean;
  isIdleHidden: boolean;
  progressAnchorMs: number;
  anchorTimestamp: number;
  settings: UISettings;
  draggingSliderKey: NumericSettingKey | null;
  onSeekLyric: (timeMs: number) => void;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
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
  isDesktopSplitActive,
  isMorphingSplitTransition = false,
  isStackedVinylPlayer,
  showControls,
  isPlaying,
  isPreviewMode,
  isIdleHidden,
  progressAnchorMs,
  anchorTimestamp,
  settings,
  draggingSliderKey,
  onSeekLyric,
  onPrevious,
  onPlayPause,
  onNext,
  onOpenLyricPicker,
  onOpenSettings,
  onStartPreview,
}: LyricsViewportProps) {
  const wrapperRef = useRef<HTMLElement | null>(null);
  const manualScrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const wrapElsRef = useRef<Array<HTMLDivElement | null>>([]);
  const lineElsRef = useRef<Array<HTMLElement | null>>([]);
  const wordEnterElsRef = useRef<Array<Array<HTMLSpanElement | null>>>([]);
  const wordWaveElsRef = useRef<Array<Array<HTMLSpanElement | null>>>([]);
  const introWrapRef = useRef<HTMLDivElement | null>(null);
  const interludeSlotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastTargetTranslateYRef = useRef<number | null>(null);

  const [splitImgFailed, setSplitImgFailed] = useState(false);
  const lastNonNullTrackRef = useRef<TrackMetadata | null>(track);
  if (track) {
    lastNonNullTrackRef.current = track;
  }

  const isVinylShowcase = status === 'lyrics_not_found' && Boolean(track);
  const showSplitAside = Boolean(isDesktopSplitActive && track && !isVinylShowcase);
  const [wasMorphExit, setWasMorphExit] = useState(false);

  if (showSplitAside && wasMorphExit) {
    setWasMorphExit(false);
  } else if (!showSplitAside && isMorphingSplitTransition && !wasMorphExit) {
    setWasMorphExit(true);
  }

  const asideExitDurationMs = isMorphingSplitTransition
    ? LAYOUT_MORPH_DURATION_MS + 1200
    : wasMorphExit
      ? 0
      : SPLIT_ASIDE_EXIT_DURATION_MS;
  const splitAsidePresence = usePresenceTransition(showSplitAside, asideExitDurationMs);
  const splitDisplayTrack = track ?? lastNonNullTrackRef.current;

  useEffect(() => {
    setSplitImgFailed(false);
  }, [track?.albumArtUrl]);

  const tokenizedLines = useMemo<LyricWordToken[][]>(() => {
    if (isPlainLyrics || lyrics.length === 0) return [];
    return lyrics.map((line) => tokenizeLyricWords(line.text));
  }, [lyrics, isPlainLyrics]);

  const tokenizedLinesRef = useRef<LyricWordToken[][]>(tokenizedLines);
  tokenizedLinesRef.current = tokenizedLines;

  const activeLineAnimsRef = useRef<
    Map<
      number,
      {
        enterAnims: Animation[];
        waveAnims: Animation[];
        layoutSignature: string;
        settleTimer: number | null;
      }
    >
  >(new Map());
  const activeFilterReleaseTimerRef = useRef<number | null>(null);
  const waveRateRef = useRef<number>(isPlaying ? 1 : 0);
  const reducedMotionRef = useRef<boolean>(false);

  const cancelLineWordMotion = useCallback((lineIdx: number) => {
    const existing = activeLineAnimsRef.current.get(lineIdx);
    if (!existing) return;
    if (existing.settleTimer !== null) {
      window.clearTimeout(existing.settleTimer);
    }
    existing.enterAnims.forEach((a) => a.cancel());
    existing.waveAnims.forEach((a) => a.cancel());
    lineElsRef.current[lineIdx]?.classList.remove('is-settling');
    activeLineAnimsRef.current.delete(lineIdx);
  }, []);

  const clearAllLineMotionDom = useCallback(() => {
    if (activeFilterReleaseTimerRef.current !== null) {
      window.clearTimeout(activeFilterReleaseTimerRef.current);
      activeFilterReleaseTimerRef.current = null;
    }
    activeLineAnimsRef.current.forEach((_, lineIdx) => {
      cancelLineWordMotion(lineIdx);
    });
    activeLineAnimsRef.current.clear();
  }, [cancelLineWordMotion]);

  const measureLineWordPositions = useCallback(
    (lineIdx: number, fontSize: number): { positions: WordVisualPosition[]; signature: string } => {
      const words = tokenizedLinesRef.current[lineIdx] ?? [];
      const enterEls = wordEnterElsRef.current[lineIdx] ?? [];
      const boxes = words.map((_, idx) => {
        const el = enterEls[idx];
        return el
          ? {
              offsetLeft: el.offsetLeft,
              offsetTop: el.offsetTop,
              offsetWidth: el.offsetWidth,
            }
          : { offsetLeft: 0, offsetTop: 0, offsetWidth: 0 };
      });
      const fallbackCols = words.map((w) => w.centerCol);
      const positions = computeWordVisualPositions(boxes, fallbackCols, fontSize);
      const signature = `${fontSize}|${positions
        .map((p) => `${p.rowIndex}:${Math.round(p.visualCol * 2)}`)
        .join(',')}`;
      return { positions, signature };
    },
    []
  );

  const spawnWaveAnimationsForLine = useCallback(
    (
      waveEls: Array<HTMLSpanElement | null>,
      positions: WordVisualPosition[],
      fontSize: number,
      initialRate: number,
      priorWaveYs?: number[]
    ): Animation[] => {
      const waveAnims: Animation[] = [];
      for (let wIdx = 0; wIdx < positions.length; wIdx++) {
        const waveEl = waveEls[wIdx];
        if (!waveEl || typeof waveEl.animate !== 'function') continue;

        const pos = positions[wIdx];
        const waveSpec = buildWordWaveSpec(pos.visualCol, fontSize, pos.rowIndex);
        // Negative delay puts every word across all wrapped rows into immediate 2D diagonal wave phase from t=0
        const startDelayMs =
          waveSpec.phaseOffsetMs > 0 ? -(waveSpec.periodMs - waveSpec.phaseOffsetMs) : 0;
        const wAnim = waveEl.animate(waveSpec.keyframes, {
          duration: waveSpec.periodMs,
          delay: startDelayMs,
          iterations: Infinity,
          fill: 'both',
        });
        wAnim.playbackRate = initialRate;
        waveAnims.push(wAnim);

        // Smoothly blend from priorWaveY (0px on fresh line activation) into the live 2D wave phase with zero snap
        const computedTf = window.getComputedStyle(waveEl).transform;
        const initialWaveY =
          computedTf && computedTf !== 'none' && typeof DOMMatrix === 'function'
            ? new DOMMatrix(computedTf).m42
            : 0;
        const fromY = priorWaveYs ? (priorWaveYs[wIdx] ?? 0) : 0;
        const deltaY = fromY - initialWaveY;
        if (Math.abs(deltaY) > 0.01) {
          const rampAnim = waveEl.animate(
            [
              { transform: `translate3d(0, ${Math.round(deltaY * 1000) / 1000}px, 0)` },
              { transform: 'translate3d(0, 0px, 0)' },
            ],
            {
              duration: LYRIC_WAVE_RAMP_IN_MS,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'both',
              composite: 'add',
            }
          );
          rampAnim.playbackRate = initialRate;
          waveAnims.push(rampAnim);
        }
      }
      return waveAnims;
    },
    []
  );

  const startLineWordMotion = useCallback(
    (lineIdx: number) => {
      if (reducedMotionRef.current || isPlainRef.current || lineIdx < 0) return;
      cancelLineWordMotion(lineIdx);

      const words = tokenizedLinesRef.current[lineIdx];
      const enterEls = wordEnterElsRef.current[lineIdx];
      const waveEls = wordWaveElsRef.current[lineIdx];
      if (!words || words.length === 0 || !enterEls || !waveEls) return;

      lineElsRef.current[lineIdx]?.classList.remove('is-settling');

      const fontSize = settingsRef.current.fontSize;
      const initialRate = Math.round(waveRateRef.current * 1000) / 1000;
      const { positions, signature } = measureLineWordPositions(lineIdx, fontSize);
      const enterAnims: Animation[] = [];

      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const enterEl = enterEls[wIdx];
        if (enterEl && typeof enterEl.animate === 'function') {
          const enterSpec = buildWordEntranceSpec(wIdx, fontSize);
          const eAnim = enterEl.animate(enterSpec.keyframes, {
            duration: enterSpec.durationMs,
            delay: enterSpec.delayMs,
            easing: enterSpec.easing,
            fill: 'both',
          });
          enterAnims.push(eAnim);
        }
      }

      const waveAnims = spawnWaveAnimationsForLine(waveEls, positions, fontSize, initialRate);

      activeLineAnimsRef.current.set(lineIdx, {
        enterAnims,
        waveAnims,
        layoutSignature: signature,
        settleTimer: null,
      });
    },
    [cancelLineWordMotion, measureLineWordPositions, spawnWaveAnimationsForLine]
  );

  const syncActiveLineWaveLayout = useCallback(() => {
    const lineIdx = activeIndexRef.current;
    if (reducedMotionRef.current || isPlainRef.current || lineIdx < 0) return;
    const existing = activeLineAnimsRef.current.get(lineIdx);
    if (!existing || existing.settleTimer !== null) return;

    const waveEls = wordWaveElsRef.current[lineIdx];
    if (!waveEls || waveEls.length === 0) return;

    const fontSize = settingsRef.current.fontSize;
    const { positions, signature } = measureLineWordPositions(lineIdx, fontSize);
    if (signature === existing.layoutSignature) return;

    const priorWaveYs = waveEls.map((el) => {
      if (!el || typeof DOMMatrix !== 'function') return 0;
      const tf = window.getComputedStyle(el).transform;
      return tf && tf !== 'none' ? new DOMMatrix(tf).m42 : 0;
    });

    existing.waveAnims.forEach((a) => a.cancel());
    const currentRate = Math.round(waveRateRef.current * 1000) / 1000;
    existing.waveAnims = spawnWaveAnimationsForLine(
      waveEls,
      positions,
      fontSize,
      currentRate,
      priorWaveYs
    );
    existing.layoutSignature = signature;
  }, [measureLineWordPositions, spawnWaveAnimationsForLine]);

  const settleOutLineWordMotion = useCallback((lineIdx: number) => {
    const existing = activeLineAnimsRef.current.get(lineIdx);
    if (!existing) return;
    if (existing.settleTimer !== null) return;

    const enterEls = wordEnterElsRef.current[lineIdx];
    const waveEls = wordWaveElsRef.current[lineIdx];
    const lineEl = lineElsRef.current[lineIdx];

    const enterSnapshots = (enterEls ?? []).map((el) =>
      el ? window.getComputedStyle(el).transform : 'none'
    );
    const waveSnapshots = (waveEls ?? []).map((el) =>
      el ? window.getComputedStyle(el).transform : 'none'
    );

    existing.enterAnims.forEach((a) => a.cancel());
    existing.waveAnims.forEach((a) => a.cancel());
    lineEl?.classList.add('is-settling');

    const settleEnterAnims: Animation[] = [];
    const settleWaveAnims: Animation[] = [];

    if (enterEls) {
      for (let i = 0; i < enterEls.length; i++) {
        const el = enterEls[i];
        const fromTf = enterSnapshots[i];
        if (!el || !fromTf || fromTf === 'none' || typeof el.animate !== 'function') continue;
        settleEnterAnims.push(
          el.animate(
            [{ transform: fromTf }, { transform: 'translate3d(0, 0px, 0) scale(1)' }],
            {
              duration: LYRIC_LINE_DEACTIVATE_DURATION_MS,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }
          )
        );
      }
    }

    if (waveEls) {
      for (let i = 0; i < waveEls.length; i++) {
        const el = waveEls[i];
        const fromTf = waveSnapshots[i];
        if (!el || !fromTf || fromTf === 'none' || typeof el.animate !== 'function') continue;
        settleWaveAnims.push(
          el.animate(
            [{ transform: fromTf }, { transform: 'translate3d(0, 0px, 0)' }],
            {
              duration: LYRIC_LINE_DEACTIVATE_DURATION_MS,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }
          )
        );
      }
    }

    const settleTimer = window.setTimeout(() => {
      settleEnterAnims.forEach((a) => a.cancel());
      settleWaveAnims.forEach((a) => a.cancel());
      lineEl?.classList.remove('is-settling');
      activeLineAnimsRef.current.delete(lineIdx);
    }, LYRIC_LINE_DEACTIVATE_DURATION_MS + 30);

    activeLineAnimsRef.current.set(lineIdx, {
      enterAnims: settleEnterAnims,
      waveAnims: settleWaveAnims,
      layoutSignature: '',
      settleTimer,
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
      if (e.matches) {
        clearAllLineMotionDom();
      } else if (activeIndexRef.current >= 0) {
        startLineWordMotion(activeIndexRef.current);
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [clearAllLineMotionDom, startLineWordMotion]);

  useEffect(() => {
    return () => {
      clearAllLineMotionDom();
    };
  }, [clearAllLineMotionDom]);

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
  const lastManualTransformRef = useRef<string>('translate3d(0, 0px, 0)');
  const lastWrapperSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
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

      const wasBlurred = el.style.filter !== '' && el.style.filter !== 'none';
      const nextFilter =
        blurPx <= 0.05
          ? isActive && wasBlurred && !plain && !forceClearBlur
            ? 'blur(0px)'
            : 'none'
          : `blur(${blurPx}px)`;
      const nextOpacity = String(opacity);

      if (el.style.filter !== nextFilter) {
        el.style.filter = nextFilter;
      }
      if (el.style.opacity !== nextOpacity) {
        el.style.opacity = nextOpacity;
      }
      if (isActive) {
        if (!el.classList.contains('active')) el.classList.add('active');
        if (nextFilter === 'blur(0px)') {
          if (activeFilterReleaseTimerRef.current !== null) {
            window.clearTimeout(activeFilterReleaseTimerRef.current);
          }
          const capturedIdx = i;
          activeFilterReleaseTimerRef.current = window.setTimeout(() => {
            activeFilterReleaseTimerRef.current = null;
            const activeEl = lineElsRef.current[capturedIdx];
            if (activeEl && activeIndexRef.current === capturedIdx) {
              activeEl.style.filter = 'none';
            }
          }, 540);
        }
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
        const prevY = lastTargetTranslateYRef.current;

        if (prevY === null || Math.abs(prevY - translateY) > 0.5) {
          lastTargetTranslateYRef.current = translateY;
          const targetTransform = `translate3d(0, ${-translateY}px, 0)`;
          if (introWrapRef.current) {
            introWrapRef.current.style.transition = 'none';
            introWrapRef.current.style.setProperty('--delay', '0s');
            introWrapRef.current.style.transform = targetTransform;
          }
          for (const wrap of wrapElsRef.current) {
            if (!wrap) continue;
            wrap.style.transition = 'none';
            wrap.style.setProperty('--delay', '0s');
            wrap.style.transform = targetTransform;
          }
          // Single batched subtree style/layout flush (avoids N per-line forced reflows)
          void content.offsetHeight;
          if (introWrapRef.current) {
            introWrapRef.current.style.transition = '';
          }
          for (const wrap of wrapElsRef.current) {
            if (!wrap) continue;
            wrap.style.transition = '';
          }
        }
      }
    }
  }, [getCollapsingInterludeHeightAbove]);

  useLayoutEffect(() => {
    applySettingsToDocumentCss(settingsRef.current);
    clearAllLineMotionDom();
    wrapElsRef.current = wrapElsRef.current.slice(0, lyrics.length);
    lineElsRef.current = lineElsRef.current.slice(0, lyrics.length);
    wordEnterElsRef.current = wordEnterElsRef.current.slice(0, lyrics.length);
    wordWaveElsRef.current = wordWaveElsRef.current.slice(0, lyrics.length);
    activeIndexRef.current = -1;
    lastTargetTranslateYRef.current = null;
    lastInterludeKeyRef.current = '';
    targetManualOffsetRef.current = 0;
    manualOffsetRef.current = 0;
    plainScrollYRef.current = 0;
    isManualScrollingRef.current = false;

    if (manualScrollRef.current) {
      manualScrollRef.current.style.transform = 'translate3d(0, 0px, 0)';
      lastManualTransformRef.current = 'translate3d(0, 0px, 0)';
    }
    if (introWrapRef.current) {
      introWrapRef.current.style.transition = 'none';
      introWrapRef.current.style.setProperty('--delay', '0s');
      introWrapRef.current.style.transform = 'translate3d(0, 0px, 0)';
      void window.getComputedStyle(introWrapRef.current).transform;
      introWrapRef.current.style.transition = '';
    }
    for (const wrap of wrapElsRef.current) {
      if (wrap) {
        wrap.style.transition = 'none';
        wrap.style.setProperty('--delay', '0s');
        wrap.style.transform = 'translate3d(0, 0px, 0)';
        void window.getComputedStyle(wrap).transform;
        wrap.style.transition = '';
      }
    }

    alignLinesImmediately();
    applyLineVisualStyles(-1);
  }, [
    lyrics,
    isPlainLyrics,
    status,
    alignLinesImmediately,
    applyLineVisualStyles,
    clearAllLineMotionDom,
  ]);

  // Apply updated CSS custom properties BEFORE measuring DOM offsets (child useLayoutEffect runs before parent App useLayoutEffect)
  useLayoutEffect(() => {
    applySettingsToDocumentCss(settingsRef.current);
    alignLinesImmediately();
    syncActiveLineWaveLayout();
  }, [
    settings.vertPos,
    settings.fontSize,
    settings.lineHeight,
    settings.margin,
    status,
    isDesktopSplitActive,
    alignLinesImmediately,
    syncActiveLineWaveLayout,
  ]);

  useLayoutEffect(() => {
    applyLineVisualStyles(activeIndexRef.current);
  }, [
    settings.blurAmount,
    draggingSliderKey,
    applyLineVisualStyles,
  ]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') {
      const onResize = () => {
        alignLinesImmediately();
        syncActiveLineWaveLayout();
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    lastWrapperSizeRef.current = {
      w: wrapper.clientWidth,
      h: wrapper.clientHeight,
    };

    // Observe only the viewport wrapper (never #lyrics-content, whose height animates during interlude 0fr<->1fr transitions)
    const observer = new ResizeObserver(() => {
      const nextW = wrapper.clientWidth;
      const nextH = wrapper.clientHeight;
      const widthChanged = nextW !== lastWrapperSizeRef.current.w;
      if (!widthChanged && nextH === lastWrapperSizeRef.current.h) {
        return;
      }
      lastWrapperSizeRef.current = { w: nextW, h: nextH };
      alignLinesImmediately();
      if (widthChanged) {
        syncActiveLineWaveLayout();
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [status, isDesktopSplitActive, alignLinesImmediately, syncActiveLineWaveLayout]);

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
        const nextTransform = `translate3d(0, ${-roundedPlain}px, 0)`;
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

        manualOffsetRef.current += (targetManualOffsetRef.current - manualOffsetRef.current) * 0.12;

        const roundedManual = Math.round(manualOffsetRef.current * 100) / 100;
        const nextTransform = `translate3d(0, ${-roundedManual}px, 0)`;
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
            clearAllLineMotionDom();
            activeIndexRef.current = -1;
            if (introWrapRef.current) {
              introWrapRef.current.style.setProperty('--delay', '0s');
              introWrapRef.current.style.transform = 'translate3d(0, 0px, 0)';
            }
            for (const wrap of wrapElsRef.current) {
              if (wrap) {
                wrap.style.setProperty('--delay', '0s');
                wrap.style.transform = 'translate3d(0, 0px, 0)';
              }
            }
            applyLineVisualStyles(-1);
          }

          const estimatedProgress = rawTrackProgress + currentSettings.syncOffset;
          const newActiveIndex = findActiveLyricIndex(currentLyrics, estimatedProgress);

          if (newActiveIndex !== activeIndexRef.current) {
            const prevActiveIdx = activeIndexRef.current;
            if (prevActiveIdx >= 0) {
              settleOutLineWordMotion(prevActiveIdx);
            }

            if (newActiveIndex === -1) {
              activeIndexRef.current = -1;
              lastTargetTranslateYRef.current = 0;
              if (introWrapRef.current) {
                introWrapRef.current.style.setProperty('--delay', '0s');
                introWrapRef.current.style.transform = 'translate3d(0, 0px, 0)';
              }
              for (const wrap of wrapElsRef.current) {
                if (wrap) {
                  wrap.style.setProperty('--delay', '0s');
                  wrap.style.transform = 'translate3d(0, 0px, 0)';
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
                startLineWordMotion(newActiveIndex);
                // Update interlude DOM first so any slot above newActiveIndex marks data-active="false"
                updateInterludeDom(estimatedProgress, pb.isPlaying);

                const restingOffsetTop =
                  activeWrap.offsetTop - getCollapsingInterludeHeightAbove(newActiveIndex);
                const lineEl = lineElsRef.current[newActiveIndex];
                const elementCenter = (lineEl ? lineEl.clientHeight : activeWrap.clientHeight) / 2;
                const targetCenter = wrapper.clientHeight * (currentSettings.vertPos / 100);
                const translateY = restingOffsetTop - targetCenter + elementCenter;
                lastTargetTranslateYRef.current = translateY;
                const targetTransform = `translate3d(0, ${-translateY}px, 0)`;

                if (introWrapRef.current) {
                  introWrapRef.current.style.setProperty('--delay', '0s');
                  introWrapRef.current.style.transform = targetTransform;
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
                  wrap.style.transform = targetTransform;
                }
              }
            }
          }

          // Smoothly ramp GPU compositor wave playbackRate on Play <-> Pause transitions without main-thread transform churn
          const targetRate = pb.isPlaying && !reducedMotionRef.current ? 1 : 0;
          if (Math.abs(waveRateRef.current - targetRate) > 0.002) {
            const rampFactor = 1 - Math.exp(-deltaTime / 240);
            waveRateRef.current += (targetRate - waveRateRef.current) * rampFactor;
            if (Math.abs(waveRateRef.current - targetRate) <= 0.003) {
              waveRateRef.current = targetRate;
            }
            const curAnimEntry = activeLineAnimsRef.current.get(activeIndexRef.current);
            if (curAnimEntry && curAnimEntry.settleTimer === null) {
              const roundedRate = Math.round(waveRateRef.current * 1000) / 1000;
              for (let i = 0; i < curAnimEntry.waveAnims.length; i++) {
                curAnimEntry.waveAnims[i].playbackRate = roundedRate;
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
  }, [
    applyLineVisualStyles,
    clearAllLineMotionDom,
    getCollapsingInterludeHeightAbove,
    settleOutLineWordMotion,
    startLineWordMotion,
    updateInterludeDom,
  ]);

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

  return (
    <div className="lyrics-viewport-shell relative z-10 flex-1 min-h-0 w-full max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center lg:gap-14 xl:gap-16 px-6 sm:px-12">
      {/* Wide-Screen Dual Split View Left Artwork + Inline Apple Music Player Panel (PPT Shared-Element Morph on Single <-> Split toggle) */}
      {splitAsidePresence.shouldRender && splitDisplayTrack && (
        <aside
          aria-label="현재 재생 트랙 정보"
          data-testid="split-view-artwork-panel"
          data-presence={splitAsidePresence.phase}
          data-morph-mode={isMorphingSplitTransition || wasMorphExit ? 'morph' : 'fade'}
          className="split-aside-presence hud-layer-pinned relative z-20 flex flex-col lg:h-full w-[320px] xl:w-[356px] shrink-0 justify-center pb-8 select-none"
        >
          <div data-morph-role="split-artwork-carrier" className="relative w-full aspect-square">
            <div
              aria-hidden="true"
              data-morph-role="split-artwork-shadow"
              data-playing={isPlaying ? 'true' : 'false'}
              className="split-artwork-shadow-layer"
            />
            {splitDisplayTrack.albumArtUrl && !splitImgFailed ? (
              <img
                src={splitDisplayTrack.albumArtUrl}
                alt={`${splitDisplayTrack.title} 앨범 커버`}
                data-morph-role="split-artwork"
                referrerPolicy="no-referrer"
                data-playing={isPlaying ? 'true' : 'false'}
                onError={() => setSplitImgFailed(true)}
                className="split-artwork-breathe relative z-10 w-full h-full rounded-2xl object-cover border border-white/10"
              />
            ) : (
              <div
                data-morph-role="split-artwork"
                data-playing={isPlaying ? 'true' : 'false'}
                className="split-artwork-breathe relative z-10 w-full h-full rounded-2xl bg-[var(--bg-card)] border border-[var(--border-hairline)] flex items-center justify-center"
              >
                <Disc3 size={48} strokeWidth={1.5} className="text-[var(--text-muted)]" />
              </div>
            )}
          </div>

          {/* Track Title & Artist (in-place soft reveal/dissolve on view toggle) + Subtle Circular Lyric Picker Trigger */}
          <div
            data-morph-role="split-meta-row"
            className="mt-5 flex items-center justify-between gap-3 w-full"
          >
            <div className="min-w-0 flex-1">
              <MarqueeText
                as="h2"
                text={splitDisplayTrack.title}
                testId="split-track-title"
                className="text-[17px] xl:text-lg font-semibold text-white leading-snug"
              />
              <MarqueeText
                as="p"
                text={splitDisplayTrack.artist}
                testId="split-track-artist"
                className="text-[14px] xl:text-[15px] text-white/65 mt-0.5"
              />
            </div>

            <button
              type="button"
              onClick={onOpenLyricPicker}
              aria-label="가사 변경"
              title={lyricSource ? `가사 변경 · 출처: ${lyricSource}` : '가사 변경'}
              className={`w-8 h-8 rounded-full bg-white/12 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center shrink-0 active:scale-[0.94] transition-[background-color,color,transform,opacity] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] cursor-pointer focus-visible:outline-2 focus-visible:outline-white ${
                isIdleHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            >
              <ListMusic size={15} strokeWidth={1.6} />
            </button>
          </div>

          {/* Inline Progress Scrubber & Transport Controls (No Repeat / Shuffle / Volume) */}
          <MediaControls
            variant="split"
            visible={showControls}
            hiddenBySetting={settings.hideControls}
            isIdleHidden={isIdleHidden}
            isPlaying={isPlaying}
            isPreviewMode={isPreviewMode}
            durationMs={splitDisplayTrack.durationMs || 45000}
            progressAnchorMs={progressAnchorMs}
            anchorTimestamp={anchorTimestamp}
            onSeek={onSeekLyric}
            onPrevious={onPrevious}
            onPlayPause={onPlayPause}
            onNext={onNext}
          />
        </aside>
      )}

      {/* Main Viewport: Synced Lyrics (with top/bottom mask) or Centered LP Vinyl Showcase (unmasked) */}
      <main
        ref={wrapperRef}
        id="lyrics-wrapper"
        onScroll={(e) => {
          if (e.currentTarget.scrollTop !== 0) {
            e.currentTarget.scrollTop = 0;
          }
        }}
        className={
          isVinylShowcase
            ? 'relative z-10 flex-1 min-h-0 h-full overflow-visible flex flex-col items-center justify-center'
            : `lyrics-mask relative z-10 flex-1 min-h-0 h-full overflow-y-clip overflow-x-visible ${
                isDesktopSplitActive
                  ? '-mx-8 px-8 lg:-ml-12 lg:pl-14 lg:-mr-10 lg:pr-10'
                  : '-mx-8 px-8 sm:-mx-6 sm:px-12 md:-mx-4 md:px-16'
              }`
        }
      >
        {status === 'lyrics_ready' && lyrics.length > 0 ? (
          <div data-morph-role="lyrics-stage" className="w-full">
            <div
              ref={manualScrollRef}
              id="manual-scroll-container"
              className="w-full lyrics-stage-fade-enter"
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
                      aria-label={lyric.text}
                      ref={(el) => {
                        lineElsRef.current[index] = el;
                      }}
                      onClick={() => handleLineClick(lyric.time)}
                      className="lyric-line cursor-pointer bg-transparent border-0 p-0 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--text-primary)] rounded-lg"
                    >
                      <span aria-hidden="true" className="lyric-line-tokens">
                        {(tokenizedLines[index] ?? []).map((wToken, wIdx) => (
                          <Fragment key={wIdx}>
                            {wToken.hasLeadingSpace && ' '}
                            <span
                              ref={(el) => {
                                let arr = wordEnterElsRef.current[index];
                                if (!arr) {
                                  arr = [];
                                  wordEnterElsRef.current[index] = arr;
                                }
                                arr[wIdx] = el;
                              }}
                              className="lyric-word-enter"
                            >
                              <span
                                ref={(el) => {
                                  let wArr = wordWaveElsRef.current[index];
                                  if (!wArr) {
                                    wArr = [];
                                    wordWaveElsRef.current[index] = wArr;
                                  }
                                  wArr[wIdx] = el;
                                }}
                                className="lyric-word-wave"
                              >
                                {wToken.word}
                              </span>
                            </span>
                          </Fragment>
                        ))}
                      </span>
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

              <div
                className={`flex items-center gap-3 mt-16 mb-[32vh] transition-opacity duration-300 ${
                  isIdleHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
                }`}
              >
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
          </div>
        ) : isVinylShowcase && track ? (
          <div
            ref={contentRef}
            id="lyrics-content"
            data-status={status}
            data-active-lyric-index="-1"
            className={`w-full h-full flex flex-col items-center justify-center ${
              isStackedVinylPlayer ? 'pb-4 sm:pb-6' : 'vinyl-single-stage-wrap'
            }`}
          >
            <VinylSleeveShowcase
              key={track.id}
              track={track}
              isPlaying={isPlaying}
              variant={isStackedVinylPlayer ? 'split-stage' : 'single-stage'}
            />

            {isStackedVinylPlayer && (
              <div
                data-testid="vinyl-split-player-panel"
                className="vinyl-player-panel-enter hud-layer-pinned relative z-20 flex flex-col w-full max-w-[304px] sm:max-w-[336px] md:max-w-[356px] xl:max-w-[372px] mt-6 sm:mt-7 select-none"
              >
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="min-w-0 flex-1">
                    <MarqueeText
                      as="h2"
                      text={track.title}
                      testId="split-track-title"
                      className="text-[16px] sm:text-[17px] xl:text-lg font-semibold text-white leading-snug"
                    />
                    <MarqueeText
                      as="p"
                      text={track.artist}
                      testId="split-track-artist"
                      className="text-[13px] sm:text-[14px] xl:text-[15px] text-white/65 mt-0.5"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={onOpenLyricPicker}
                    aria-label="가사 변경"
                    title="가사 변경 (LRCLIB)"
                    className={`relative w-9 h-9 lg:w-8 lg:h-8 after:content-[''] after:absolute after:-inset-1.5 rounded-full bg-white/12 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center shrink-0 active:scale-[0.94] transition-[background-color,color,transform,opacity] duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-white ${
                      isIdleHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
                    }`}
                  >
                    <ListMusic size={15} strokeWidth={1.6} />
                  </button>
                </div>

                <MediaControls
                  variant="split"
                  visible={showControls}
                  hiddenBySetting={settings.hideControls}
                  isIdleHidden={isIdleHidden}
                  isPlaying={isPlaying}
                  isPreviewMode={isPreviewMode}
                  durationMs={track.durationMs || 45000}
                  progressAnchorMs={progressAnchorMs}
                  anchorTimestamp={anchorTimestamp}
                  onSeek={onSeekLyric}
                  onPrevious={onPrevious}
                  onPlayPause={onPlayPause}
                  onNext={onNext}
                />
              </div>
            )}
          </div>
        ) : (
          <div
            ref={contentRef}
            id="lyrics-content"
            data-morph-role="lyrics-stage"
            data-status={status}
            data-active-lyric-index="-1"
            className="h-full flex flex-col justify-center items-start max-w-lg pb-12"
          >
            {status === 'connecting' && (
              <p className="status-searching-breathe text-xl sm:text-2xl font-medium text-[var(--text-secondary)]">
                Spotify 연결 중
              </p>
            )}

            {status === 'searching_lyrics' && (
              <p className="status-searching-breathe text-xl sm:text-2xl font-medium text-[var(--text-secondary)]">
                LRCLIB에서 가사를 찾는 중
              </p>
            )}

            {status === 'lyrics_not_found' && (
              <div className="notice-banner-enter space-y-2">
                <p className="text-xl sm:text-2xl font-medium text-[var(--text-primary)]">
                  재생 중인 곡 없음
                </p>
              </div>
            )}

            {status === 'auth_error' && (
              <div className="notice-banner-enter space-y-5">
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
              <div className="notice-banner-enter space-y-2">
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
                  <h2 className="hero-stagger-1 text-2xl sm:text-3xl font-medium text-[var(--text-primary)] leading-tight break-keep">
                    재생 중인 곡의 싱크 가사를 화면 가득 띄웁니다
                  </h2>
                  <p className="hero-stagger-2 text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed break-keep">
                    Spotify 계정을 원클릭으로 연결하거나 미리보기로 가사 흐름을 먼저 살펴보세요
                  </p>
                </div>
                <div className="hero-stagger-3 flex items-center gap-2">
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
