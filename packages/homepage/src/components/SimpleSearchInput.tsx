import { forwardRef } from 'react'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { Button, Input } from "@browse-dot-show/ui"

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
  const handleChange = (newValue: string) => {
    onChange(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !disabled) {
      onSearch();
    }
  };

  const handleSearchClick = () => {
    if (!disabled) {
      onSearch();
    }
  };

  const canSearch = value.trim().length >= 1 && !isLoading && !disabled;

  return (
    <div className="relative flex gap-2">
      <Input
        ref={ref}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="text-sm h-14 sm:h-16 pr-4 bg-background border-input"
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