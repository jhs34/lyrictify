import { useEffect, useRef } from 'react';

export function useWakeLock(enabled: boolean): void {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const acquireWakeLock = async () => {
      if (!enabled || !('wakeLock' in navigator) || isCancelled) return;
      if (wakeLockRef.current !== null) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (isCancelled) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
          }
        });
      } catch {
        // Wake Lock may be disallowed by browser policy or battery saver
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current !== null) {
        try {
          await wakeLockRef.current.release();
        } catch {
          // Ignore release errors
        } finally {
          wakeLockRef.current = null;
        }
      }
    };

    if (enabled) {
      void acquireWakeLock();
    } else {
      void releaseWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && wakeLockRef.current === null) {
        void acquireWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [enabled]);
}
