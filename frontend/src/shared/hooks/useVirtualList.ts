import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";

interface UseVirtualListOptions {
  itemCount: number;
  estimateSize: (index: number) => number;
  overscan?: number;
  containerRef: RefObject<HTMLElement>;
}

interface VirtualItem {
  index: number;
  start: number;
  size: number;
}

interface UseVirtualListResult {
  virtualItems: VirtualItem[];
  totalHeight: number;
  scrollToIndex: (index: number) => void;
}

export function useVirtualList({ itemCount, estimateSize, overscan = 4, containerRef }: UseVirtualListOptions): UseVirtualListResult {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const handleScroll = () => {
      setScrollOffset(container.scrollTop);
    };
    const handleResize = () => {
      setContainerHeight(container.clientHeight);
    };
    handleResize();
    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [containerRef]);

  const { virtualItems, totalHeight } = useMemo(() => {
    if (itemCount === 0) {
      return { virtualItems: [], totalHeight: 0 };
    }
    const sizes = Array.from({ length: itemCount }, (_, index) => estimateSize(index));
    const starts = sizes.reduce<number[]>((accumulator, size, index) => {
      if (index === 0) {
        accumulator.push(0);
      } else {
        accumulator.push(accumulator[index - 1] + sizes[index - 1]);
      }
      return accumulator;
    }, []);

    let startIndex = 0;
    for (let index = 0; index < itemCount; index += 1) {
      const start = starts[index];
      const size = sizes[index];
      if (start + size > scrollOffset) {
        startIndex = index;
        break;
      }
    }

    const viewportHeight = containerHeight || sizes[0];
    const limit = viewportHeight + overscan * sizes[startIndex];
    const items: VirtualItem[] = [];
    let accumulated = 0;
    for (let index = startIndex; index < itemCount && accumulated < limit; index += 1) {
      items.push({ index, start: starts[index], size: sizes[index] });
      accumulated += sizes[index];
    }

    const total = sizes.reduce((sum, size) => sum + size, 0);
    return { virtualItems: items, totalHeight: total };
  }, [itemCount, estimateSize, containerHeight, overscan, scrollOffset]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container || itemCount === 0) {
        return;
      }
      const clampedIndex = Math.max(0, Math.min(itemCount - 1, index));
      let offset = 0;
      for (let current = 0; current < clampedIndex; current += 1) {
        offset += estimateSize(current);
      }
      container.scrollTo({ top: offset, behavior: "smooth" });
    },
    [containerRef, estimateSize, itemCount],
  );

  return { virtualItems, totalHeight, scrollToIndex };
}
