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

interface Site {
  id: string
  displayName: string
  domain: string
  podcastTagline: string
  imageUrl: string
}

interface SiteSelectorProps {
  sites: Site[]
  selectedSite: string
  onSiteSelect: (siteId: string) => void
}

export default function SiteSelector({ sites, selectedSite, onSiteSelect }: SiteSelectorProps) {
  const [open, setOpen] = useState(false)
  
  const selectedSiteData = sites.find(site => site.id === selectedSite)

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
              className="w-full justify-between h-auto min-h-[48px] p-3"
            >
              {selectedSiteData ? (
                <div className="flex items-center gap-3">
                  <img
                    src={selectedSiteData.imageUrl}
                    alt={selectedSiteData.displayName}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{selectedSiteData.displayName}</span>
                    <span className="text-xs text-muted-foreground">{selectedSiteData.domain}</span>
                  </div>
                </div>
              ) : (
                "Select a podcast..."
              )}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandInput placeholder="Search podcasts..." />
              <CommandList>
                <CommandEmpty>No podcasts found.</CommandEmpty>
                <CommandGroup>
                  {sites.map((site) => (
                    <CommandItem
                      key={site.id}
                      value={site.id}
                      onSelect={(currentValue: string) => {
                        onSiteSelect(currentValue === selectedSite ? "" : currentValue)
                        setOpen(false)
                      }}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <img
                          src={site.imageUrl}
                          alt={site.displayName}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                        <div className="flex flex-col items-start flex-grow min-w-0">
                          <span className="font-medium truncate w-full">{site.displayName}</span>
                          <span className="text-xs text-muted-foreground truncate w-full">{site.domain}</span>
                        </div>
                        <Check
                          className={cn(
                            "ml-auto h-4 w-4 flex-shrink-0",
                            selectedSite === site.id ? "opacity-100" : "opacity-0"
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
      
      {/* Show tagline when a site is selected */}
      {selectedSiteData && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground italic">
            {selectedSiteData.podcastTagline}
          </p>
        </div>
      )}
    </div>
  )
} 