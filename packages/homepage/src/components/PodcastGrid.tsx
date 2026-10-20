import { ArrowUpRight } from 'lucide-react'
import { LINKS } from '../constants'
import { siteUrl } from '../config/deployed-sites'
import { Site } from '../types/search'
import { trackEvent } from '../utils/goatcounter'

/** Each site's artwork, linking to it; then a tile to request another */
export default function PodcastGrid({ sites }: { sites: Site[] }) {
  return (
    <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-6">
      {sites.map((site, i) => (
        <li key={site.id} className="bds-reveal" style={{ '--i': i % 6 } as React.CSSProperties}>
          <a href={siteUrl(site)} title={site.domain} className="group block outline-none">
            <div className="bds-lift relative aspect-square border-2 border-foreground overflow-hidden bg-muted">
              <img src={site.imageUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 px-1.5 py-1 bg-secondary text-secondary-foreground border-t-2 border-foreground text-[10px] font-bold translate-y-full group-hover:translate-y-0 group-focus-visible:translate-y-0 transition-transform duration-200">
                <span className="truncate">"{site.searchInputPlaceholder}"</span>
                <ArrowUpRight className="size-3 shrink-0" />
              </span>
            </div>
            <div className="mt-2 text-xs font-bold leading-snug line-clamp-2">{site.displayName}</div>
          </a>
        </li>
      ))}
      <li className="bds-reveal">
        <a
          href={LINKS.requestPodcast}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent({ eventType: 'Request Podcast Button Clicked - homepage' })}
          className="group block outline-none"
        >
          <div className="bds-lift aspect-square border-2 border-dashed border-foreground flex items-center justify-center text-3xl text-muted-foreground group-hover:text-foreground transition-colors">
            +
          </div>
          <div className="mt-2 text-xs font-bold leading-snug">Request one</div>
        </a>
      </li>
    </ul>
  )
}
