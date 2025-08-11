import { Button, cn } from '@browse-dot-show/ui'
import { trackEvent } from '../utils/goatcounter'

interface RequestPodcastButtonProps {
  /** Additional CSS classes to apply to the button */
  className?: string
  /** Button variant - defaults to default */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive'
  /** Button size - defaults to default */
  size?: 'default' | 'sm' | 'lg' | 'icon'
  /** Button text - defaults to "🗳️ Request a podcast" */
  children?: React.ReactNode
  /** Usage type - defaults to 'homepage' */
  usageType?: 'homepage' | 'site-selector'
}

const buttonClass = "homepage-cta-primary w-full sm:w-auto px-8 py-3 text-lg font-bold text-primary-foreground"

/**
 * Shared button component for requesting new podcasts to be added to browse.show
 */
export default function RequestPodcastButton({ 
  className, 
  variant = 'default',
  size = 'default',
  children = '🗳️ Request a podcast', 
  usageType = 'homepage'
}: RequestPodcastButtonProps) {
  const handleClick = () => {
    trackEvent({
      eventType: `Request Podcast Button Clicked - ${usageType}`,
    })
    window.open('https://forms.gle/A3PoU2PSBQVgb5K96', '_blank')
  }

  return (
    <Button
      onClick={handleClick}
      variant={variant}
      size={size}
      className={cn(buttonClass, className)}
    >
      {children}
    </Button>
  )
}
