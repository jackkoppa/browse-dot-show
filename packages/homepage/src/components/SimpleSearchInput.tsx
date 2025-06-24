import { Search } from 'lucide-react'
import { Button, Input } from "@browse-dot-show/ui"

interface SimpleSearchInputProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  isLoading: boolean
  placeholder?: string
  disabled?: boolean
}

export default function SimpleSearchInput({ 
  value, 
  onChange, 
  onSearch,
  isLoading,
  placeholder = "Search for topics, quotes, or moments...",
  disabled = false
}: SimpleSearchInputProps) {
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
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="text-sm h-12 pr-4 bg-background border-input"
      />
      <Button
        onClick={handleSearchClick}
        variant={canSearch ? 'default' : 'outline'}
        disabled={!canSearch}
        size="sm"
        className="h-12 px-4"
      >
        {isLoading ? (
          <div className="animate-spin rounded-full border-2 border-current border-t-transparent h-4 w-4"></div>
        ) : (
          <Search className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
} 