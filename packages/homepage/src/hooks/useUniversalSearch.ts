import { useLayoutEffect, useRef, useState } from 'react'
import { siteUrl } from '../config/deployed-sites'
import { Site } from '../types/search'
import { trackEvent } from '../utils/goatcounter'

/** Pick a podcast, type a query, go to that site's search results */
export function useUniversalSearch() {
  const [selectedSite, setSelectedSite] = useState<Site | null>(null)
  const [query, setQuery] = useState('')
  const [focusRequest, setFocusRequest] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input once it has rendered with the newly selected site
  useLayoutEffect(() => {
    if (focusRequest) inputRef.current?.focus()
  }, [focusRequest])

  const selectSite = (site: Site) => {
    setSelectedSite(site)
    setQuery('')
    setFocusRequest(n => n + 1)
  }

  const submit = () => {
    const trimmed = query.trim()
    if (!selectedSite || !trimmed) return
    trackEvent({
      eventType: `Universal Search: '${trimmed}' on [${selectedSite.id}]`,
      eventName: 'Universal Search Performed',
    })
    window.open(siteUrl(selectedSite, trimmed), '_self')
  }

  return { selectedSite, selectSite, query, setQuery, inputRef, submit, canSubmit: !!selectedSite && !!query.trim() }
}
