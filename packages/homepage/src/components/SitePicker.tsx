import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  Popover, PopoverContent, PopoverTrigger, cn,
} from '@browse-dot-show/ui'
import { LINKS } from '../constants'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { Site } from '../types/search'
import { trackEvent } from '../utils/goatcounter'

interface SitePickerProps {
  sites: Site[]
  /** The site shown in the trigger */
  shownSite: Site | null
  onSelect: (site: Site) => void
  /** Called when the list opens or closes */
  onOpenChange?: (open: boolean) => void
  className?: string
}

/** A podcast picker that reads as part of a sentence, searchable by name or domain */
export default function SitePicker({ sites, shownSite, onSelect, onOpenChange, className }: SitePickerProps) {
  const [open, setOpenState] = useState(false)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  // After a pick, focus goes to the search input (see useUniversalSearch), not back to this trigger
  const justSelected = useRef(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* A span, not a button: buttons don't wrap across lines, and this sits inside a sentence */}
        <span
          role="combobox"
          tabIndex={0}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Podcast: ${shownSite?.displayName ?? 'none selected'}`}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
            }
          }}
          className={cn('cursor-pointer outline-none focus-visible:bg-muted', className)}
        >
          <SiteLabel text={shownSite?.displayName ?? 'a podcast'} open={open} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(26rem,calc(100vw-2rem))] p-0 border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1"
        align="start"
        onOpenAutoFocus={(e: Event) => { if (!isDesktop) e.preventDefault() }}
        onCloseAutoFocus={(e: Event) => { if (justSelected.current) e.preventDefault(); justSelected.current = false }}
      >
        <Command>
          <CommandInput placeholder="filter..." />
          <CommandList className="max-h-[50vh]">
            <CommandEmpty>
              <div className="py-4 px-3 text-sm">
                Not here yet.{' '}
                <a
                  href={LINKS.requestPodcast}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  onClick={() => trackEvent({ eventType: 'Request Podcast Button Clicked - site-selector' })}
                >
                  Request it
                </a>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {sites.map(site => (
                <CommandItem
                  key={site.id}
                  value={`${site.displayName} ${site.domain}`}
                  onSelect={() => { justSelected.current = true; onSelect(site); setOpen(false) }}
                  className="gap-3 [&[data-selected=true]_.domain]:text-current"
                >
                  <img src={site.imageUrl} alt="" className="size-8 shrink-0 border border-foreground object-cover" loading="lazy" />
                  <span className="flex flex-col min-w-0">
                    <span className="truncate font-bold">{site.displayName}</span>
                    <span className="domain truncate text-xs text-muted-foreground">{site.domain}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Wrapping text that fades in when it changes, with the chevron kept on the last word's line */
export function SiteLabel({ text, open = false }: { text: string; open?: boolean }) {
  const lastSpace = text.lastIndexOf(' ')
  return (
    <span key={text} className="bds-fade-in">
      {text.slice(0, lastSpace + 1)}
      <span className="whitespace-nowrap">
        {text.slice(lastSpace + 1)}
        <ChevronDown className={cn('inline size-4 ml-1 align-middle opacity-60 transition-transform duration-200', open && 'rotate-180')} />
      </span>
    </span>
  )
}
