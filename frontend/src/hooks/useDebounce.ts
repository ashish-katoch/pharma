import { useRef, useCallback, useEffect } from "react";

/**
 * Returns a debounced version of `fn` that delays execution by `delayMs`.
 * The timer resets on every call; the pending call is cancelled on unmount.
 */
export function useDebounce<T extends (...args: any[]) => void>(fn: T, delayMs = 300): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(...args), delayMs);
  }, [delayMs]) as T;
}
