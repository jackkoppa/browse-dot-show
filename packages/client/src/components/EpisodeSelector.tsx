import * as React from "react"
import { Check, X, Search } from "lucide-react"
import { 
  Button, 
  Badge, 
  Command, 
  CommandInput, 
  CommandList, 
  CommandEmpty, 
  CommandGroup, 
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@browse-dot-show/ui"
import { EpisodeSelection } from "../types/search"
import { Episode, EpisodeManifest } from "@browse-dot-show/types"

interface EpisodeSelectorProps {
  episodeSelection: EpisodeSelection
  onEpisodeSelectionChange: (selection: EpisodeSelection) => void
  episodeManifest: EpisodeManifest | null
  disabled?: boolean
}

export default function EpisodeSelector({
  episodeSelection,
  onEpisodeSelectionChange,
  episodeManifest,
  disabled = false,
}: EpisodeSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")

  // Get available episodes, sorted by newest first
  const episodes = React.useMemo(() => {
    if (!episodeManifest?.episodes) return []
    return [...episodeManifest.episodes].sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
  }, [episodeManifest])

  // Filter episodes based on search term
  const filteredEpisodes = React.useMemo(() => {
    if (!searchTerm.trim()) return episodes
    
    const term = searchTerm.toLowerCase()
    return episodes.filter(episode => 
      episode.title.toLowerCase().includes(term) ||
      episode.description?.toLowerCase().includes(term) ||
      episode.sequentialId.toString().includes(term)
    )
  }, [episodes, searchTerm])

  // Get selected episodes for display
  const selectedEpisodes = React.useMemo(() => {
    return episodes.filter(episode => 
      episodeSelection.selectedEpisodeIds.includes(episode.sequentialId.toString())
    )
  }, [episodes, episodeSelection.selectedEpisodeIds])

  // Handle episode selection toggle
  const handleEpisodeToggle = (episode: Episode) => {
    const episodeIdString = episode.sequentialId.toString()
    const isSelected = episodeSelection.selectedEpisodeIds.includes(episodeIdString)
    
    const newSelectedIds = isSelected
      ? episodeSelection.selectedEpisodeIds.filter(id => id !== episodeIdString)
      : [...episodeSelection.selectedEpisodeIds, episodeIdString]
    
    onEpisodeSelectionChange({
      selectedEpisodeIds: newSelectedIds
    })
  }

  // Handle removing a selected episode
  const handleRemoveEpisode = (episodeId: string) => {
    onEpisodeSelectionChange({
      selectedEpisodeIds: episodeSelection.selectedEpisodeIds.filter(id => id !== episodeId)
    })
  }

  // Handle clear all
  const handleClearAll = () => {
    onEpisodeSelectionChange({
      selectedEpisodeIds: []
    })
  }

  // Format episode display text
  const formatEpisodeText = (episode: Episode) => {
    const date = new Date(episode.publishedAt).toLocaleDateString()
    return `#${episode.sequentialId}: ${episode.title} (${date})`
  }

  const hasSelection = episodeSelection.selectedEpisodeIds.length > 0

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold">Filter by episodes</label>
      
      {/* Episode Selector Popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left border-foreground border-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] rounded-none"
            disabled={disabled || !episodeManifest}
          >
            <Search className="mr-2 h-4 w-4" />
            {hasSelection 
              ? `${episodeSelection.selectedEpisodeIds.length} episode${episodeSelection.selectedEpisodeIds.length === 1 ? '' : 's'} selected`
              : "Select episodes..."
            }
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-[400px] p-0 border-foreground border-2 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none" 
          align="start"
        >
          <Command>
            <CommandInput 
              placeholder="Search episodes..." 
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              <CommandEmpty>No episodes found.</CommandEmpty>
              <CommandGroup>
                {filteredEpisodes.map((episode) => {
                  const episodeIdString = episode.sequentialId.toString()
                  const isSelected = episodeSelection.selectedEpisodeIds.includes(episodeIdString)
                  
                  return (
                    <CommandItem
                      key={episode.sequentialId}
                      onSelect={() => handleEpisodeToggle(episode)}
                      className="flex items-center space-x-2 cursor-pointer"
                    >
                      <div className={`
                        w-4 h-4 border-2 border-foreground rounded-sm flex items-center justify-center
                        ${isSelected ? 'bg-primary' : 'bg-background'}
                      `}>
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          #{episode.sequentialId}: {episode.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(episode.publishedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected Episodes Display */}
      {hasSelection && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Selected episodes ({episodeSelection.selectedEpisodeIds.length})
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-xs h-6 px-2"
            >
              Clear all
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {selectedEpisodes.map((episode) => (
              <Badge
                key={episode.sequentialId}
                variant="secondary"
                className="text-xs border border-foreground shadow-[1px_1px_0px_rgba(0,0,0,1)] rounded-none pr-1"
              >
                <span className="mr-1">#{episode.sequentialId}</span>
                <button
                  onClick={() => handleRemoveEpisode(episode.sequentialId.toString())}
                  className="ml-1 hover:bg-background hover:text-foreground rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Episode count info */}
      {episodeManifest && (
        <div className="text-xs text-muted-foreground">
          {episodes.length} episodes available
        </div>
      )}
    </div>
  )
}
