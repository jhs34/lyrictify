import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CHROME_EXIT_EASING,
  CHROME_REVEAL_EASING,
  LAYOUT_MORPH_DURATION_MS,
  LAYOUT_MORPH_EASING,
  MorphBox,
  computeHorizontalStageFlipDx,
  computeSharedMorphTransform,
} from '../utils/lyrics';

export type LayoutMorphDirection = 'to-split' | 'to-single';

interface MorphSnapshot {
  fromSplit: boolean;
  capturedAt: number;
  artwork: MorphBox | null;
  lyricsStage: MorphBox | null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

function measureBox(el: HTMLElement | null): MorphBox | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0.5 || rect.height <= 0.5) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function readRoleBox(root: HTMLElement, role: string): MorphBox | null {
  return measureBox(root.querySelector<HTMLElement>(`[data-morph-role="${role}"]`));
}

export function useSplitLayoutMorph(
  isDesktopSplitActive: boolean,
  canMorph: boolean
): {
  viewportRootRef: React.RefObject<HTMLDivElement | null>;
  activeMorphDirection: LayoutMorphDirection | null;
  isMorphingSplitTransition: boolean;
  captureBeforeSplitToggle: () => void;
} {
  const viewportRootRef = useRef<HTMLDivElement | null>(null);
  const pendingSnapshotRef = useRef<MorphSnapshot | null>(null);
  const lastCommittedSplitRef = useRef<boolean>(isDesktopSplitActive);

  const persistentAnimsRef = useRef<Animation[]>([]);
  const exitingAsideAnimsRef = useRef<Animation[]>([]);
  const safetyTimerRef = useRef<number | null>(null);
  const morphRunIdRef = useRef<number>(0);

  const isSplitRef = useRef<boolean>(isDesktopSplitActive);
  const canMorphRef = useRef<boolean>(canMorph);
  isSplitRef.current = isDesktopSplitActive;
  canMorphRef.current = canMorph;

  const [settledMorphDir, setSettledMorphDir] = useState<LayoutMorphDirection | null>(null);

  const cancelAllMorphAnims = useCallback(() => {
    morphRunIdRef.current += 1;
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    persistentAnimsRef.current.forEach((a) => a.cancel());
    persistentAnimsRef.current = [];
    exitingAsideAnimsRef.current.forEach((a) => a.cancel());
    exitingAsideAnimsRef.current = [];
  }, []);

  // Capture live visual bounding boxes of ONLY the spatial Morph actors (Album Cover + Lyrics Stage)
  const captureBeforeSplitToggle = useCallback(() => {
    const root = viewportRootRef.current;
    if (!root || !canMorphRef.current || prefersReducedMotion()) {
      pendingSnapshotRef.current = null;
      return;
    }

    const fromSplit = isSplitRef.current;
    pendingSnapshotRef.current = {
      fromSplit,
      capturedAt: performance.now(),
      artwork: readRoleBox(root, fromSplit ? 'split-artwork' : 'header-artwork'),
      lyricsStage: readRoleBox(root, 'lyrics-stage'),
    };
  }, []);

  const isStartingMorphNow =
    canMorph &&
    pendingSnapshotRef.current !== null &&
    pendingSnapshotRef.current.fromSplit !== isDesktopSplitActive &&
    !prefersReducedMotion();

  const activeMorphDirection: LayoutMorphDirection | null = isStartingMorphNow
    ? isDesktopSplitActive
      ? 'to-split'
      : 'to-single'
    : settledMorphDir;

  useLayoutEffect(() => {
    if (lastCommittedSplitRef.current === isDesktopSplitActive) {
      return;
    }

    lastCommittedSplitRef.current = isDesktopSplitActive;
    const snap = pendingSnapshotRef.current;
    pendingSnapshotRef.current = null;

    // Cancel any previous animations so DOM measurements reflect pure resting layout boxes
    cancelAllMorphAnims();

    const root = viewportRootRef.current;
    const now = performance.now();
    if (
      !root ||
      !snap ||
      snap.fromSplit === isDesktopSplitActive ||
      now - snap.capturedAt > 1200 ||
      !canMorph ||
      prefersReducedMotion()
    ) {
      setSettledMorphDir(null);
      return;
    }

    const direction: LayoutMorphDirection = isDesktopSplitActive ? 'to-split' : 'to-single';
    setSettledMorphDir(direction);

    const q = (role: string) => root.querySelector<HTMLElement>(`[data-morph-role="${role}"]`);
    const isHudIdleHidden =
      root.querySelector('#main-header')?.getAttribute('data-idle-hidden') === 'true';

    const persistentAnims: Animation[] = [];
    const exitingAsideAnims: Animation[] = [];

    const runAnim = (
      targetBucket: Animation[],
      el: HTMLElement | null,
      keyframes: Keyframe[],
      durationMs: number,
      delayMs = 0,
      easing = LAYOUT_MORPH_EASING
    ) => {
      if (!el || typeof el.animate !== 'function') return;
      targetBucket.push(
        el.animate(keyframes, {
          duration: durationMs,
          delay: delayMs,
          easing,
          fill: 'both',
        })
      );
    };

    const artworkCarrier = q('split-artwork-carrier');
    const artworkShadow = q('split-artwork-shadow');
    const artworkImg = q('split-artwork');
    const splitMetaRow = q('split-meta-row');
    const splitScrubberGroup = q('split-scrubber-group');
    const splitTransport = q('split-transport');
    const lyricsStage = q('lyrics-stage');

    if (direction === 'to-split') {
      // 1. SPATIAL MORPH: Album cover glides & expands smoothly from top-left 44x44 header slot -> middle-left 356x356 Split View slot
      const restArt = measureBox(artworkImg);
      const artSpec = computeSharedMorphTransform(
        restArt!,
        snap.artwork!,
        restArt!,
        'contain-uniform'
      );
      if (artSpec) {
        const startRadiusPx =
          artSpec.fromScaleX > 0.04 ? `${Math.round((8 / artSpec.fromScaleX) * 10) / 10}px` : '64px';
        runAnim(
          persistentAnims,
          artworkCarrier,
          [{ transform: artSpec.fromTransform }, { transform: artSpec.toTransform }],
          LAYOUT_MORPH_DURATION_MS
        );
        runAnim(
          persistentAnims,
          artworkImg,
          [{ borderRadius: startRadiusPx }, { borderRadius: '16px' }],
          LAYOUT_MORPH_DURATION_MS
        );
        runAnim(
          persistentAnims,
          artworkShadow,
          [{ opacity: 0 }, { opacity: 0, offset: 0.22 }, { opacity: 1 }],
          LAYOUT_MORPH_DURATION_MS
        );
      }

      // 2. IN-PLACE STAGGERED REVEAL (Non-Flying): Split View Title/Artist, Scrubber, and Transport rise softly in place
      runAnim(
        persistentAnims,
        splitMetaRow,
        [
          { opacity: 0, transform: 'translate3d(0, 10px, 0) scale(0.985)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        ],
        480,
        145,
        CHROME_REVEAL_EASING
      );

      if (!isHudIdleHidden) {
        runAnim(
          persistentAnims,
          splitScrubberGroup,
          [
            { opacity: 0, transform: 'translate3d(0, 9px, 0) scale(0.985)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          ],
          480,
          205,
          CHROME_REVEAL_EASING
        );
        runAnim(
          persistentAnims,
          splitTransport,
          [
            { opacity: 0, transform: 'translate3d(0, 10px, 0) scale(0.945)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          ],
          480,
          260,
          CHROME_REVEAL_EASING
        );
      }
    } else {
      // direction === 'to-single' (Split View -> Single View)
      const headerArtwork = q('header-artwork');
      const headerMeta = q('header-meta');
      const headerPlayerGroup = q('header-player-group');
      const headerTransport = q('header-transport');
      const headerPicker = q('header-lyric-picker');

      // 1. SPATIAL MORPH: High-res 356x356 Split View cover glides & shrinks smoothly into 44x44 header slot
      const restArt = measureBox(artworkImg);
      const endArt = measureBox(headerArtwork);
      const artSpec = computeSharedMorphTransform(
        restArt!,
        snap.artwork!,
        endArt!,
        'contain-uniform'
      );
      if (artSpec) {
        const endRadiusPx =
          artSpec.toScaleX > 0.04 ? `${Math.round((8 / artSpec.toScaleX) * 10) / 10}px` : '64px';
        runAnim(
          exitingAsideAnims,
          artworkCarrier,
          [{ transform: artSpec.fromTransform }, { transform: artSpec.toTransform }],
          LAYOUT_MORPH_DURATION_MS
        );
        runAnim(
          exitingAsideAnims,
          artworkCarrier,
          [{ opacity: 1 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }],
          LAYOUT_MORPH_DURATION_MS
        );
        runAnim(
          exitingAsideAnims,
          artworkImg,
          [{ borderRadius: '16px' }, { borderRadius: endRadiusPx }],
          LAYOUT_MORPH_DURATION_MS
        );
        runAnim(
          exitingAsideAnims,
          artworkShadow,
          [{ opacity: 1 }, { opacity: 0, offset: 0.55 }, { opacity: 0 }],
          LAYOUT_MORPH_DURATION_MS
        );
        runAnim(
          persistentAnims,
          headerArtwork,
          [{ opacity: 0 }, { opacity: 0, offset: 0.72 }, { opacity: 1 }],
          LAYOUT_MORPH_DURATION_MS
        );
      } else if (artworkCarrier) {
        runAnim(exitingAsideAnims, artworkCarrier, [{ opacity: 1 }, { opacity: 0 }], 240);
      }

      // 2. IN-PLACE DISSOLVE (Non-Flying): Split View Title/Artist, Scrubber, and Transport melt out softly in place
      if (!isHudIdleHidden) {
        runAnim(
          exitingAsideAnims,
          splitTransport,
          [
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
            { opacity: 0, transform: 'translate3d(0, 7px, 0) scale(0.955)' },
          ],
          190,
          0,
          CHROME_EXIT_EASING
        );
        runAnim(
          exitingAsideAnims,
          splitScrubberGroup,
          [
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
            { opacity: 0, transform: 'translate3d(0, 6px, 0) scale(0.985)' },
          ],
          195,
          20,
          CHROME_EXIT_EASING
        );
      }
      runAnim(
        exitingAsideAnims,
        splitMetaRow,
        [
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          { opacity: 0, transform: 'translate3d(0, 6px, 0) scale(0.985)' },
        ],
        205,
        35,
        CHROME_EXIT_EASING
      );

      // 3. IN-PLACE STAGGERED REVEAL (Non-Flying): Single View Header Title/Artist, Scrubber, Transport, and Picker rise softly in place
      runAnim(
        persistentAnims,
        headerMeta,
        [
          { opacity: 0, transform: 'translate3d(0, 6px, 0)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        ],
        460,
        155,
        CHROME_REVEAL_EASING
      );

      if (!isHudIdleHidden) {
        runAnim(
          persistentAnims,
          headerPlayerGroup,
          [
            { opacity: 0, transform: 'translate3d(0, 5px, 0) scale(0.985)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          ],
          460,
          205,
          CHROME_REVEAL_EASING
        );
        runAnim(
          persistentAnims,
          headerTransport,
          [
            { opacity: 0, transform: 'translate3d(0, 5px, 0) scale(0.95)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          ],
          460,
          250,
          CHROME_REVEAL_EASING
        );
        runAnim(
          persistentAnims,
          headerPicker,
          [
            { opacity: 0, transform: 'translate3d(0, 5px, 0) scale(0.95)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          ],
          460,
          265,
          CHROME_REVEAL_EASING
        );
      }
    }

    // 4. SPATIAL MORPH: Pure horizontal FLIP glide on lyrics stage synchronized to 720ms velvety easing
    const restLyricsStage = measureBox(lyricsStage);
    if (snap.lyricsStage && restLyricsStage) {
      const dx = computeHorizontalStageFlipDx(snap.lyricsStage.left, restLyricsStage.left);
      if (Math.abs(dx) > 2) {
        runAnim(
          persistentAnims,
          lyricsStage,
          [
            { transform: `translate3d(${dx}px, 0, 0)` },
            { transform: 'translate3d(0, 0, 0)' },
          ],
          LAYOUT_MORPH_DURATION_MS
        );
      }
    }

    persistentAnimsRef.current = persistentAnims;
    exitingAsideAnimsRef.current = exitingAsideAnims;

    const runId = morphRunIdRef.current;
    const allAnims = [...persistentAnims, ...exitingAsideAnims];

    const finalizeMorphRun = () => {
      if (morphRunIdRef.current !== runId) return;
      morphRunIdRef.current += 1;
      if (safetyTimerRef.current !== null) {
        window.clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      persistentAnimsRef.current.forEach((a) => a.cancel());
      persistentAnimsRef.current = [];
      setSettledMorphDir(null);
    };

    if (allAnims.length > 0) {
      void Promise.allSettled(allAnims.map((a) => a.finished)).then(finalizeMorphRun);
    }
    safetyTimerRef.current = window.setTimeout(finalizeMorphRun, LAYOUT_MORPH_DURATION_MS + 1100);
  }, [isDesktopSplitActive, canMorph, cancelAllMorphAnims]);

  useEffect(() => {
    return () => {
      cancelAllMorphAnims();
    };
  }, [cancelAllMorphAnims]);

  return {
    viewportRootRef,
    activeMorphDirection,
    isMorphingSplitTransition: activeMorphDirection !== null,
    captureBeforeSplitToggle,
  };
}
