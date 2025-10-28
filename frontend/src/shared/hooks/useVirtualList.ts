import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

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
  registerItem: (index: number, element: HTMLElement | null) => void;
}

export function useVirtualList({ itemCount, estimateSize, overscan = 4, containerRef }: UseVirtualListOptions): UseVirtualListResult {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [version, setVersion] = useState(0);
  const sizeMapRef = useRef<Map<number, number>>(new Map());
  const observerMapRef = useRef<Map<number, ResizeObserver>>(new Map());
  const pendingUpdateRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleVersionUpdate = useCallback(() => {
    if (pendingUpdateRef.current) {
      return;
    }
    pendingUpdateRef.current = true;
    timeoutRef.current = setTimeout(() => {
      pendingUpdateRef.current = false;
      timeoutRef.current = null;
      setVersion((value) => value + 1);
    }, 16);
  }, []);

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

  useEffect(() => {
    return () => {
      observerMapRef.current.forEach((observer) => observer.disconnect());
      observerMapRef.current.clear();
      sizeMapRef.current.clear();
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      pendingUpdateRef.current = false;
    };
  }, []);

  const { virtualItems, totalHeight } = useMemo(() => {
    if (itemCount === 0) {
      return { virtualItems: [], totalHeight: 0 };
    }
    const sizeMap = sizeMapRef.current;
    const sizes = Array.from({ length: itemCount }, (_, index) => sizeMap.get(index) ?? estimateSize(index));
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
  }, [itemCount, estimateSize, containerHeight, overscan, scrollOffset, version]);

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

  const registerItem = useCallback(
    (index: number, element: HTMLElement | null) => {
      const sizeMap = sizeMapRef.current;
      const observerMap = observerMapRef.current;
      if (!element) {
        sizeMap.delete(index);
        const observer = observerMap.get(index);
        observer?.disconnect();
        if (observer) {
          observerMap.delete(index);
        }
        return;
      }
      const measure = () => {
        const height = element.getBoundingClientRect().height;
        if (height > 0 && sizeMap.get(index) !== height) {
          sizeMap.set(index, height);
          scheduleVersionUpdate();
        }
      };
      measure();
      if (typeof ResizeObserver !== "undefined") {
        const existing = observerMap.get(index);
        existing?.disconnect();
        const observer = new ResizeObserver(() => {
          measure();
        });
        observer.observe(element);
        observerMap.set(index, observer);
      }
    },
    [scheduleVersionUpdate],
  );

  return { virtualItems, totalHeight, scrollToIndex, registerItem };
}
