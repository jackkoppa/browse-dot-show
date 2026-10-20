import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { Waveform } from '@browse-dot-show/blocks'
import { Button } from "@browse-dot-show/ui"
import { Input } from "@browse-dot-show/ui"
import siteConfig from '@/config/site-config'
import { useMinimumDuration } from '@/hooks/useMinimumDuration'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  isLoading: boolean
  mostRecentSuccessfulSearchQuery: string | null
  headerConfig: {
    extraHeightForLongTitle?: boolean
    includeTitlePrefix?: boolean
  }
}

const { searchPlaceholderOptions } = siteConfig

// Do this outside of React component, so that we always get the same placeholder for each page load
const placeholderBase = searchPlaceholderOptions[Math.floor(Math.random() * searchPlaceholderOptions.length)]
const placeholder = `e.g. "${placeholderBase}"`

// The loader fades in, stays fully visible for at least 600ms (even if results are already back), then fades out
const LOADER_FADE_MS = 100 // matches duration-100 on the icons below
const LOADER_MIN_VISIBLE_MS = 600

export default function SearchInput({ 
  value, 
  onChange, 
  onSearch,
  isLoading,
  mostRecentSuccessfulSearchQuery,
  headerConfig,
}: SearchInputProps) {
  const handleChange = (newValue: string) => {
    onChange(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  const handleSearchClick = () => {
    onSearch();
  };

  const showLoader = useMinimumDuration(isLoading, LOADER_FADE_MS + LOADER_MIN_VISIBLE_MS);
  const showInteractiveButton = mostRecentSuccessfulSearchQuery !== value && value.trim().length >= 2 && !showLoader;
  
  // Show a more centered, larger search input on the first search, or when the user has cleared the search input
  const showBigSearchInput = Boolean(!mostRecentSuccessfulSearchQuery);
  let containerClassName = '';
  if (showBigSearchInput) {
    containerClassName = 'pt-30';
  } else if (headerConfig.extraHeightForLongTitle) {
    containerClassName = 'pt-12';
  } else {
    containerClassName = 'pt-4';
  }
  const inputClassName = showBigSearchInput ? 'h-16' : 'h-12';
  const buttonClassName = showBigSearchInput ? 'h-16 w-16' : 'h-12 w-12';
  const inputTopPosition = headerConfig.includeTitlePrefix ? 'top-16 xs:top-19 sm:top-13' : 'top-10 xs:top-14 sm:top-13';

  return (
    <div className={`mx-[-16px] text-card-foreground pb-8 px-[16px] sticky ${inputTopPosition} flex flex-col items-center bg-gradient-to-b from-background from-85% to-transparent z-10 transition-[padding] duration-500 ${containerClassName}`}>
      <div className="relative w-full flex gap-2">
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`text-md shadow-sm transition-shadow focus-visible:shadow-[4px_4px_0_0_var(--primary)] ${inputClassName}`}
        />
        <Button
          onClick={handleSearchClick}
          variant={showInteractiveButton ? 'default' : 'ghost'}
          disabled={!showInteractiveButton}
          className={`relative p-0 border-foreground border-2 shadow-[4px_4px_0px_rgba(0,0,0,1)] ${showLoader ? 'disabled:opacity-100' : ''} ${buttonClassName}`}
        >
          {/* Both stay mounted, so they can crossfade */}
          <MagnifyingGlassIcon
            className={`size-8 transition-opacity duration-100 ${showLoader ? 'opacity-0' : 'opacity-100'} ${showInteractiveButton ? 'text-primary-foreground' : 'text-muted-foreground'}`}
          />
          <Waveform
            className={`absolute inset-0 m-auto size-9 text-primary transition-opacity duration-100 ${showLoader ? 'opacity-100' : 'opacity-0'}`}
            label={showLoader ? 'Searching' : undefined}
          />
        </Button>
      </div>
    </div>
  )
} 