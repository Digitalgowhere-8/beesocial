import { useEffect, useRef } from 'react';

export default function useInfiniteScroll({
  enabled = true,
  hasMore = false,
  loading = false,
  onLoadMore,
  root = null,
  rootMargin = '160px'
} = {}) {
  const targetRef = useRef(null);
  const awaitingResetRef = useRef(false);

  useEffect(() => {
    if (!loading) {
      awaitingResetRef.current = false;
    }
  }, [loading]);

  useEffect(() => {
    const node = targetRef.current;
    if (!node || !enabled || !hasMore || loading || typeof onLoadMore !== 'function') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting || awaitingResetRef.current) return;
        const didStart = onLoadMore();
        if (didStart === false) return;
        awaitingResetRef.current = true;
      },
      { root, rootMargin, threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, hasMore, loading, onLoadMore, root, rootMargin]);

  return targetRef;
}
