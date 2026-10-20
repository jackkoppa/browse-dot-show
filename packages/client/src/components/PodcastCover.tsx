import { cn } from '@browse-dot-show/ui'

/**
 * A podcast's cover art, beside its title on multi-feed sites (search results and the episode panel).
 * Decorative, since the title is next to it. 32px by default; the files are 128px, for sharp screens.
 */
export default function PodcastCover({ src, className }: { src: string; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn('size-8 shrink-0 border-2 border-foreground bg-muted object-cover', className)}
    />
  )
}
