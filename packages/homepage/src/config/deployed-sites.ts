import deployedSitesConfig from '../../deployed-sites.config.jsonc'
import { Site } from '../types/search'

const { externalSites, originSites } = deployedSitesConfig.sites

/** Every site on the homepage, A-Z by podcast name */
export const deployedSites: Site[] = Object.entries({ ...externalSites, ...originSites })
  .map(([id, site]) => ({
    id,
    displayName: site.displayedPodcastName,
    domain: site.domain,
    podcastTagline: site.podcastTagline,
    imageUrl: site.imageUrl,
    searchInputPlaceholder: site.searchInputPlaceholder,
  }))
  .sort((a, b) => a.displayName.localeCompare(b.displayName))

/** The site's homepage, or its search results for `query` */
export const siteUrl = (site: Site, query?: string) =>
  `https://${site.domain}/${query ? `?q=${encodeURIComponent(query)}` : ''}`
