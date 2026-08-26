import { useEffect, useRef } from "react";

// Lazy-load sentinel: calls `onLoadMore` when the returned ref scrolls into
// view, but only while `enabled` (i.e. status === "CanLoadMore"). Attach the
// ref to an element at the bottom of a scrollable list.
export function useInfiniteScroll(
  enabled: boolean,
  onLoadMore: () => void,
) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, onLoadMore]);
  return ref;
}
