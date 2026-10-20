import { useCallback, useEffect, useRef, useState } from 'react'

/** The sentinel's height: within this of the top, the header is always expanded */
const AT_TOP_PX = 32
/**
 * How far past the edge of the panel the search result's row goes before the header collapses, as a share of the
 * panel's height. From the middle of the panel, that's about a screen of scrolling either way.
 */
const SEARCH_RESULT_FAR_MARGIN = '50%'
/** A little longer than the header's 200ms transitions */
const TRANSITION_MS = 250

/**
 * A sticky header that collapses as its scroll container scrolls:
 * - Within `AT_TOP_PX` of the top, it's expanded.
 * - Opened from a search result (`startsAtSearchResult`), it starts expanded, at that row. It collapses once the row
 *   is about a screen out of view, and expands again when the row is back in view.
 * - Once the listener clicks another row (`onEntryClick`), or without a search result, it's collapsed anywhere but
 *   the top. After a click, it waits for the listener's own scrolling (not the scroll to the playing row).
 * - Tapping the collapsed header (`expand`) expands it, until a tap elsewhere in the panel.
 *
 * Render `sentinel` as the scroll container's first child (the container must be positioned), and pass the search
 * result's row to `setSearchResultEntry` once it's scrolled to. IntersectionObservers, rather than scroll listeners.
 *
 * Give the sticky header `style={{ minHeight: reservedHeight }}`, with the content (`contentRef`) inside it. The
 * header keeps its expanded height in the layout, with the collapsed content at its top, so the transcript under it
 * doesn't move when it collapses or expands: scrolling to a row still lands on it.
 */
export function useCollapsingHeader({ startsAtSearchResult }: { startsAtSearchResult: boolean }) {
  const [isAtTop, setIsAtTop] = useState(true)
  const [isFollowingSearchResult, setIsFollowingSearchResult] = useState(startsAtSearchResult)
  const [isSearchResultFar, setIsSearchResultFar] = useState(false)
  const [isHeldAfterClick, setIsHeldAfterClick] = useState(false)
  const [expandedByTap, setExpandedByTap] = useState(false)
  const [searchResultEntry, setSearchResultEntry] = useState<HTMLElement | null>(null)
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null)
  const [reservedHeight, setReservedHeight] = useState<number>()

  const collapsedByScroll = !isAtTop && (isFollowingSearchResult ? isSearchResultFar : !isHeldAfterClick)
  const collapsed = collapsedByScroll && !expandedByTap

  const contentElementRef = useRef<HTMLElement | null>(null)
  // Set once the search result's row has been in view: until then, the panel is still scrolling to it
  const hasSeenSearchResultRef = useRef(false)
  // Measure the content only while it's expanded and not mid-transition, when it's at its full height
  const isMeasurableRef = useRef(true)

  const sentinelRef = useCallback((sentinel: HTMLDivElement | null) => {
    const container = sentinel?.parentElement
    // Without IntersectionObserver (old browsers, tests), the header stays expanded
    if (!sentinel || !container || typeof IntersectionObserver === 'undefined') return
    setScrollContainer(container)

    const observer = new IntersectionObserver(([entry]) => setIsAtTop(entry.isIntersecting), { root: container })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // Following the search result's row: far once it's well out of view, near again once it's in view (below the
  // header). The gap between the two keeps the header from flickering at either edge
  useEffect(() => {
    if (!isFollowingSearchResult || !searchResultEntry || !scrollContainer) return

    const farObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && hasSeenSearchResultRef.current) setIsSearchResultFar(true)
    }, { root: scrollContainer, rootMargin: `${SEARCH_RESULT_FAR_MARGIN} 0px ${SEARCH_RESULT_FAR_MARGIN} 0px` })
    const inViewObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      hasSeenSearchResultRef.current = true
      setIsSearchResultFar(false)
    }, { root: scrollContainer, rootMargin: `-${reservedHeight ?? 0}px 0px 0px 0px` })
    farObserver.observe(searchResultEntry)
    inViewObserver.observe(searchResultEntry)
    return () => {
      farObserver.disconnect()
      inViewObserver.disconnect()
    }
  }, [isFollowingSearchResult, searchResultEntry, scrollContainer, reservedHeight])

  // After a click on another row, stay as is until the listener scrolls
  useEffect(() => {
    if (!isHeldAfterClick || !scrollContainer) return
    const release = () => setIsHeldAfterClick(false)
    const events = ['wheel', 'touchmove', 'keydown'] as const
    events.forEach(event => scrollContainer.addEventListener(event, release, { once: true, passive: true }))
    return () => events.forEach(event => scrollContainer.removeEventListener(event, release))
  }, [isHeldAfterClick, scrollContainer])

  // Expanded by a tap: a tap elsewhere in the panel (not in the header, or a popover opened from it) collapses it
  useEffect(() => {
    if (!expandedByTap || !scrollContainer) return
    const collapseOnTapOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!contentElementRef.current?.contains(target)) setExpandedByTap(false)
    }
    scrollContainer.addEventListener('pointerdown', collapseOnTapOutside)
    return () => scrollContainer.removeEventListener('pointerdown', collapseOnTapOutside)
  }, [expandedByTap, scrollContainer])

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

  const expand = useCallback(() => setExpandedByTap(true), [])

  /** The listener clicked a row: that's what they're following now, rather than the search result */
  const onEntryClick = useCallback(() => {
    setIsFollowingSearchResult(false)
    if (!collapsed) setIsHeldAfterClick(true)
  }, [collapsed])

  const sentinel = (
    <div ref={sentinelRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0" style={{ height: AT_TOP_PX }} />
  )

  return { collapsed, expand, sentinel, contentRef, reservedHeight, setSearchResultEntry, onEntryClick }
}
