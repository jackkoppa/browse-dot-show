import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@browse-dot-show/ui'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@browse-dot-show/ui'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@browse-dot-show/ui'
import { cn } from '@browse-dot-show/ui'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { Site } from '../types/search'
import RequestPodcastButton from './RequestPodcastButton'


interface SiteSelectorProps {
  sites: Site[]
  selectedSite: Site | null
  onSiteSelect: (site: Site) => void
}


/** So that both title & domain can be searchable via SiteSelector */
const getSearchableSiteValue = (site: Site) => {
  return `${site.displayName} ${site.domain}`
}

export default function SiteSelector({ sites, selectedSite, onSiteSelect }: SiteSelectorProps) {
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')


  const handleSiteSelect = (updatedSearchSelection: string) => {
    const site = sites.find(site => getSearchableSiteValue(site) === updatedSearchSelection)
    if (!site) {
      console.error(`Site not found for search selection: ${updatedSearchSelection}`)
      return
    }

    if (!selectedSite) {
      onSiteSelect(site)
      setOpen(false)
      return
    }
    if (getSearchableSiteValue(site) === getSearchableSiteValue(selectedSite)) {
      setOpen(false)
      return
    }

    onSiteSelect(site)
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold mb-3 text-foreground sr-only">
          Choose a podcast:
        </label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between h-auto min-h-[48px] sm:min-h-[64px] p-3 group text-foreground"
            >
              {selectedSite ? (
                <div className="flex items-center gap-3">
                  <img
                    src={selectedSite.imageUrl}
                    alt={selectedSite.displayName}
                    className="w-8 h-8 sm:w-14 sm:h-14 rounded-full object-cover"
                  />
                  <div className="flex flex-col items-start">
                    <span className="font-bold text-sm sm:text-lg">{selectedSite.displayName}</span>
                    <span className="text-xs text-muted-foreground group-hover:text-background">{selectedSite.domain}</span>
                  </div>
                </div>
              ) : (
                <span className="flex h-[33px] sm:h-14 items-center">Select a podcast...</span>
              )}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-(--radix-popover-trigger-width) p-0" 
            align="start" 
            onOpenAutoFocus={(e: MouseEvent) => !isDesktop && e.preventDefault()}
          >
            <Command>
              <CommandInput placeholder="Search podcasts..." />
              <CommandList>
                <CommandEmpty>
                  <div className="py-6 text-center">
                    <p className="text-sm text-muted-foreground mb-4">
                      Don't see your favorite podcast?
                    </p>
                    <RequestPodcastButton
                      size="default"
                      className="mx-auto w-[85%]"
                      usageType="site-selector"
                    />
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {sites.map((site) => (
                    <CommandItem
                      key={site.id}
                      value={getSearchableSiteValue(site)}
                      onSelect={(updatedSearchSelection: string) => {
                        handleSiteSelect(updatedSearchSelection)
                        setOpen(false)
                      }}
                      className="[&[data-selected=true]_.domain-text]:text-background"
                    >
                      <div className="flex items-center gap-3 w-full">
                        <img
                          src={site.imageUrl}
                          alt={site.displayName}
                          className="w-8 h-8 sm:w-14 sm:h-14 rounded-full object-cover flex-shrink-0"
                        />
                        <div className="flex flex-col items-start flex-grow min-w-0">
                          <span className="font-bold text-sm sm:text-lg truncate w-full">{site.displayName}</span>
                          <span className="text-xs text-muted-foreground domain-text truncate w-full">{site.domain}</span>
                        </div>
                        <Check
                          className={cn(
                            "ml-auto h-4 w-4 flex-shrink-0",
                            selectedSite?.id === site.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
} 