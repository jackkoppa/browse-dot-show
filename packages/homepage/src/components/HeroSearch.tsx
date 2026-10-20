import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@browse-dot-show/ui'
import SitePicker, { SiteLabel } from './SitePicker'
import { useTypewriter } from '../hooks/useTypewriter'
import { useUniversalSearch } from '../hooks/useUniversalSearch'
import { Site } from '../types/search'

// Shared by the sentence and its hidden copies, so they wrap the same way
const SENTENCE = 'text-xl xs:text-2xl sm:text-4xl leading-[1.7] font-bold'
const SITE = 'underline decoration-4 underline-offset-[0.3em] decoration-primary'
const QUERY = 'relative inline-flex items-baseline max-w-full border-b-4 border-secondary'
const BUTTON = 'ml-3 inline-flex size-10 sm:size-12 items-center justify-center align-middle border-2 border-foreground'
const queryWidth = (text: string) => ({ width: `${Math.max(text.length, 6) + 1}ch` })

/**
 * "Search [podcast] for [query] →". Until someone uses it, it cycles through each site's example query.
 */
export default function HeroSearch({ sites, examples }: { sites: Site[]; examples: Site[] }) {
  const { selectedSite, selectSite, query, setQuery, inputRef, submit, canSubmit } = useUniversalSearch()
  const [touched, setTouched] = useState(false)
  const typed = useTypewriter(examples.map(site => site.searchInputPlaceholder), { paused: touched })
  const minHeight = useTallestSentence(sites)

  const shownSite = touched ? selectedSite : examples[typed.index]
  const shownText = query || (touched ? selectedSite?.searchInputPlaceholder ?? '' : typed.text)

  const takeOver = (site?: Site) => {
    setTouched(true)
    if (site) selectSite(site)
    else if (!selectedSite && shownSite) selectSite(shownSite)
  }

  return (
    <div className="relative">
      {/* Holds the tallest sentence's height, with the text at the bottom, so the line you type on stays put */}
      <form
        onSubmit={e => { e.preventDefault(); submit() }}
        className="flex flex-col justify-end"
        style={{ minHeight: minHeight.height }}
        ref={minHeight.formRef}
      >
        <p className={SENTENCE}>
          <span>Search </span>
          <SitePicker sites={sites} shownSite={shownSite ?? null} onSelect={takeOver} className={cn(SITE, 'hover:decoration-foreground transition-colors')} />
          <span> for </span>
          <span className="whitespace-nowrap">
            <span className={cn(QUERY, 'focus-within:border-foreground transition-colors')}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => takeOver()}
                aria-label="Search for a word or phrase"
                placeholder={touched ? selectedSite?.searchInputPlaceholder : ''}
                style={queryWidth(shownText)}
                className="max-w-[60vw] bg-transparent outline-none placeholder:text-muted-foreground/60"
              />
              {!touched && (
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center whitespace-nowrap text-muted-foreground" aria-hidden="true">
                  {typed.text}<span className="bds-caret" />
                </span>
              )}
            </span>
            <button
              type="submit"
              disabled={!canSubmit}
              aria-label="Search"
              className={cn(BUTTON, 'transition', canSubmit ? 'bds-lift bg-primary text-primary-foreground cursor-pointer' : 'opacity-40 cursor-not-allowed')}
            >
              <ArrowRight className="size-5 sm:size-6" />
            </button>
          </span>
        </p>
      </form>

      {/* One hidden copy per site, with its example query, to measure the tallest */}
      <div ref={minHeight.measureRef} aria-hidden="true" className="invisible pointer-events-none absolute inset-x-0 top-0 h-0 overflow-hidden">
        {sites.map(site => (
          <p key={site.id} className={SENTENCE}>
            <span>Search </span>
            <span className={SITE}><SiteLabel text={site.displayName} /></span>
            <span> for </span>
            <span className="whitespace-nowrap">
              <span className={QUERY}><span className="inline-block max-w-[60vw]" style={queryWidth(site.searchInputPlaceholder)}>&nbsp;</span></span>
              <span className={BUTTON} />
            </span>
          </p>
        ))}
      </div>

      <p className="bds-fade-in mt-6 max-w-xl min-h-[3lh] text-muted-foreground" key={touched && selectedSite ? selectedSite.id : 'intro'}>
        {touched && selectedSite
          ? selectedSite.podcastTagline
          : 'Every episode is transcribed. Find a quote, then play the episode from that second.'}
      </p>
    </div>
  )
}

/** The height of the tallest hidden sentence, re-measured when the width changes or the font loads */
function useTallestSentence(sites: Site[]) {
  const measureRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [height, setHeight] = useState<number>()

  useLayoutEffect(() => {
    const container = measureRef.current
    if (!container) return
    const measure = () => setHeight(Math.max(...Array.from(container.children, child => child.getBoundingClientRect().height)))
    measure()
    const observer = new ResizeObserver(measure)
    if (formRef.current) observer.observe(formRef.current)
    document.fonts?.ready.then(measure)
    return () => observer.disconnect()
  }, [sites])

  return { measureRef, formRef, height }
}
