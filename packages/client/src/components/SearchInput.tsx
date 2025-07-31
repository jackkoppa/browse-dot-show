import { useCallback, useMemo } from 'react'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { Button } from "@browse-dot-show/ui"
import { Input } from "@browse-dot-show/ui"
import { useRenderTracker } from '../hooks/useRenderTracker'
import siteConfig from '@/config/site-config'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  isLoading: boolean
  mostRecentSuccessfulSearchQuery: string | null
}

const { searchPlaceholderOptions } = siteConfig

// Do this outside of React component, so that we always get the same placeholder for each page load
const placeholderBase = searchPlaceholderOptions[Math.floor(Math.random() * searchPlaceholderOptions.length)]
const placeholder = `e.g. "${placeholderBase}"`

export default function SearchInput({ 
  value, 
  onChange, 
  onSearch,
  isLoading,
  mostRecentSuccessfulSearchQuery,
}: SearchInputProps) {
  useRenderTracker('SearchInput')

  // Memoize handlers to prevent recreation on every render
  const handleChange = useCallback((newValue: string) => {
    onChange(newValue);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  }, [onSearch]);

  const handleSearchClick = useCallback(() => {
    onSearch();
  }, [onSearch]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleChange(e.target.value);
  }, [handleChange]);

  // Memoize computed values
  const showInteractiveButton = useMemo(() => 
    mostRecentSuccessfulSearchQuery !== value && value.trim().length >= 2 && !isLoading,
    [mostRecentSuccessfulSearchQuery, value, isLoading]
  );
  
  // Show a more centered, larger search input on the first search, or when the user has cleared the search input
  const showBigSearchInput = useMemo(() => 
    Boolean(!mostRecentSuccessfulSearchQuery),
    [mostRecentSuccessfulSearchQuery]
  );
  
  const { containerClassName, inputClassName, buttonClassName } = useMemo(() => ({
    containerClassName: showBigSearchInput ? 'pt-30' : 'pt-4',
    inputClassName: showBigSearchInput ? 'h-16' : 'h-12',
    buttonClassName: showBigSearchInput ? 'h-16 w-16' : 'h-12 w-12'
  }), [showBigSearchInput]);

  return (
    <div className={`mx-[-16px] text-card-foreground pb-8 px-[16px] sticky top-16 xs:top-19 sm:top-13 flex flex-col items-center bg-gradient-to-b from-background from-85% to-transparent z-10 transition-[padding] duration-500 ${containerClassName}`}>
      <div className="relative w-full flex gap-2">
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className={`text-md shadow-sm ${inputClassName}`}
        />
        <Button
          onClick={handleSearchClick}
          variant={showInteractiveButton ? 'default' : 'ghost'}
          disabled={!showInteractiveButton}
          className={`p-0 border-foreground border-2 shadow-[4px_4px_0px_rgba(0,0,0,1)] ${buttonClassName}`}
        >
          {isLoading ? (
            <div className="border-t-transparent border-solid animate-spin rounded-full border-blue-500 border-2 h-5 w-5"></div>
          ) : (
            <MagnifyingGlassIcon className={`size-8 ${showInteractiveButton ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
          )}
        </Button>
      </div>
    </div>
  )
} 