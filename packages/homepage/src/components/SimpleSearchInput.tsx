import { forwardRef, useCallback, useMemo } from 'react'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { Button, Input } from "@browse-dot-show/ui"
import { useRenderTracker } from '../hooks/useRenderTracker'

interface SimpleSearchInputProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  isLoading: boolean
  placeholder?: string
  disabled?: boolean
}

const SimpleSearchInput = forwardRef<HTMLInputElement, SimpleSearchInputProps>(({ 
  value, 
  onChange, 
  onSearch,
  isLoading,
  placeholder = "Search for topics, quotes, or moments...",
  disabled = false
}, ref) => {
  useRenderTracker('SimpleSearchInput')

  // Memoize handlers to prevent recreation on every render
  const handleChange = useCallback((newValue: string) => {
    onChange(newValue)
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !disabled) {
      onSearch()
    }
  }, [onSearch, disabled])

  const handleSearchClick = useCallback(() => {
    if (!disabled) {
      onSearch()
    }
  }, [onSearch, disabled])

  // Memoize computed values
  const canSearch = useMemo(() => {
    return value.trim().length >= 1 && !isLoading && !disabled
  }, [value, isLoading, disabled])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleChange(e.target.value)
  }, [handleChange])

  return (
    <div className="relative flex gap-2 text-foreground">
      <Input
        ref={ref}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="text-md h-14 sm:h-16 pr-4 bg-background border-input"
      />
      <Button
        onClick={handleSearchClick}
        variant={canSearch ? 'default' : 'outline'}
        disabled={!canSearch}
        size="sm"
        className="h-14 w-14 sm:w-16 sm:h-16 px-0"
      >
        {isLoading ? (
          <div className="animate-spin rounded-full border-2 border-current border-t-transparent h-4 w-4"></div>
        ) : (
          <MagnifyingGlassIcon className={`size-7 sm:size-8 ${canSearch ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
        )}
      </Button>
    </div>
  )
})

SimpleSearchInput.displayName = 'SimpleSearchInput'

export default SimpleSearchInput 