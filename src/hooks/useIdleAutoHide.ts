import { useEffect, useState } from 'react';

export function useIdleAutoHide(enabled: boolean, timeoutMs = 3500): boolean {
  const [isIdle, setIsIdle] = useState<boolean>(false);

  useEffect(() => {
    if (!enabled) {
      setIsIdle(false);
      return;
    }

    let timerId: number | null = null;

    const scheduleIdle = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        setIsIdle(true);
      }, timeoutMs);
    };

    const handleActivity = () => {
      setIsIdle(false);
      scheduleIdle();
    };

    scheduleIdle();

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('mousedown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('wheel', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity);

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('wheel', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [enabled, timeoutMs]);

  return isIdle;
}
