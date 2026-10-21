import { useEffect, useRef } from 'react';

// Calls `callback` every `intervalMs` while the screen is mounted, so
// badges and lists stay live without the person having to leave and
// re-open the screen. Errors are swallowed — a missed poll just retries
// on the next tick.
export default function useAutoRefresh(callback, intervalMs = 10000) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    const id = setInterval(() => {
      try {
        const r = saved.current();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch (e) {
        // ignore — retry on next tick
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}