import { useCallback, useEffect, useRef, useState } from 'react'

/** How far the panel scrolls before its header collapses (the sentinel's height) */
const COLLAPSE_AFTER_PX = 32
/** A little longer than the header's 200ms transitions */
const TRANSITION_MS = 250

/**
 * A sticky header that collapses once its scroll container has scrolled, and expands again at the top, or on
 * `expand()` until the next scroll.
 *
 * Render `sentinel` as the scroll container's first child (the container must be positioned): the header is
 * collapsed while the sentinel is out of view. An IntersectionObserver, rather than a scroll listener.
 *
 * Give the sticky header `style={{ minHeight: reservedHeight }}`, with the content (`contentRef`) inside it. The
 * header keeps its expanded height in the layout, with the collapsed content at its top, so the transcript under it
 * doesn't move when it collapses or expands: scrolling to a row still lands on it.
 */
export function useCollapsingHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [expandedByTap, setExpandedByTap] = useState(false)
  const [reservedHeight, setReservedHeight] = useState<number>()
  const collapsed = scrolled && !expandedByTap

  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const contentElementRef = useRef<HTMLElement | null>(null)
  // Measure the content only while it's expanded and not mid-transition, when it's at its full height
  const isMeasurableRef = useRef(true)

  const sentinelRef = useCallback((sentinel: HTMLDivElement | null) => {
    const scrollContainer = sentinel?.parentElement
    // Without IntersectionObserver (old browsers, tests), the header stays expanded
    if (!sentinel || !scrollContainer || typeof IntersectionObserver === 'undefined') return
    scrollContainerRef.current = scrollContainer

    const observer = new IntersectionObserver(([entry]) => {
      setScrolled(!entry.isIntersecting)
      if (entry.isIntersecting) setExpandedByTap(false)
    }, { root: scrollContainer })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  const contentRef = useCallback((content: HTMLElement | null) => {
    contentElementRef.current = content
    if (!content || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (isMeasurableRef.current) setReservedHeight(content.offsetHeight)
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    isMeasurableRef.current = false
    const timeout = setTimeout(() => {
      if (collapsed) return
      isMeasurableRef.current = true
      if (contentElementRef.current) setReservedHeight(contentElementRef.current.offsetHeight)
    }, TRANSITION_MS)
    return () => clearTimeout(timeout)
  }, [collapsed])

  const expand = useCallback(() => {
    setExpandedByTap(true)
    scrollContainerRef.current?.addEventListener('scroll', () => setExpandedByTap(false), { once: true, passive: true })
  }, [])

  const sentinel = (
    <div ref={sentinelRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0" style={{ height: COLLAPSE_AFTER_PX }} />
  )

  return { collapsed, expand, sentinel, contentRef, reservedHeight }
}
