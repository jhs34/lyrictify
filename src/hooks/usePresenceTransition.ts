import { useEffect, useLayoutEffect, useState } from 'react';
import { PresencePhase, resolvePresencePhaseOnToggle } from '../utils/lyrics';

function prefersReducedMotionNow(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

export function usePresenceTransition(
  isOpen: boolean,
  exitDurationMs = 200
): {
  shouldRender: boolean;
  phase: PresencePhase;
  isActive: boolean;
  isExiting: boolean;
} {
  const [phase, setPhase] = useState<PresencePhase>(() => {
    if (!isOpen) return 'unmounted';
    return prefersReducedMotionNow() ? 'entered' : 'entering';
  });

  const reduced = prefersReducedMotionNow();
  const effectivePhase: PresencePhase = isOpen
    ? phase === 'unmounted' || phase === 'exiting'
      ? reduced
        ? 'entered'
        : 'entering'
      : phase
    : phase === 'unmounted'
      ? 'unmounted'
      : reduced
        ? 'unmounted'
        : 'exiting';

  useLayoutEffect(() => {
    const rm = prefersReducedMotionNow();
    setPhase((prev) => resolvePresencePhaseOnToggle(prev, isOpen, rm));
  }, [isOpen]);

  useEffect(() => {
    if (effectivePhase === 'entering') {
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          setPhase((cur) => (cur === 'entering' ? 'entered' : cur));
        });
      });
      return () => {
        window.cancelAnimationFrame(raf1);
        if (raf2) window.cancelAnimationFrame(raf2);
      };
    }

    if (effectivePhase === 'exiting') {
      const timer = window.setTimeout(() => {
        setPhase((cur) => (cur === 'exiting' ? 'unmounted' : cur));
      }, exitDurationMs);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [effectivePhase, exitDurationMs]);

  return {
    shouldRender: effectivePhase !== 'unmounted',
    phase: effectivePhase,
    isActive: effectivePhase === 'entered',
    isExiting: effectivePhase === 'exiting',
  };
}
