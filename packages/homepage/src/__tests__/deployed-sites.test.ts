import fs from 'fs'
import path from 'path'
import { MAX_SEARCH_EXAMPLE_LENGTH } from '@browse-dot-show/sites/constants'
import deployedSitesConfig from '../../deployed-sites.config.jsonc'

/**
 * Every site in sites/origin-sites must be listed on the homepage (deployed-sites.config.jsonc),
 * so a PR that adds a site fails `pnpm all:test` until the homepage lists it too.
 */

const originSitesDir = path.resolve(__dirname, '../../../../sites/origin-sites')

interface OriginSiteConfig {
  id: string
  domain: string
  socialAndMetadata?: { canonicalUrl?: string }
}

const originSiteConfigs: OriginSiteConfig[] = fs
  .readdirSync(originSitesDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(originSitesDir, entry.name, 'site.config.json')))
  .map(entry => JSON.parse(fs.readFileSync(path.join(originSitesDir, entry.name, 'site.config.json'), 'utf8')))

const homepageOriginSites = deployedSitesConfig.sites.originSites

describe('deployed-sites.config.jsonc', () => {
  it('finds the origin sites', () => {
    expect(originSiteConfigs.length).toBeGreaterThan(0)
  })

  it('lists every site in sites/origin-sites', () => {
    const missing = originSiteConfigs.map(site => site.id).filter(id => !(id in homepageOriginSites))
    expect(missing, `Add these sites to packages/homepage/deployed-sites.config.jsonc: ${missing.join(', ')}`).toEqual([])
  })

  it('only lists sites that exist in sites/origin-sites', () => {
    const ids = new Set(originSiteConfigs.map(site => site.id))
    const unknown = Object.keys(homepageOriginSites).filter(id => !ids.has(id))
    expect(unknown, `No sites/origin-sites/<id>/site.config.json for: ${unknown.join(', ')}`).toEqual([])
  })

  it.each(originSiteConfigs.map(site => [site.id, site] as const))('%s: uses the site\'s domain or canonical URL', (id, site) => {
    const listed = homepageOriginSites[id]
    if (!listed) return // reported by the test above
    const allowed = [site.domain]
    if (site.socialAndMetadata?.canonicalUrl) allowed.push(new URL(site.socialAndMetadata.canonicalUrl).host)
    expect(allowed).toContain(listed.domain)
  })

  it('keeps every example search short enough for phones', () => {
    const sites = { ...deployedSitesConfig.sites.externalSites, ...homepageOriginSites }
    const tooLong = Object.entries(sites)
      .filter(([, site]) => site.searchInputPlaceholder.length > MAX_SEARCH_EXAMPLE_LENGTH)
      .map(([id, site]) => `${id}: "${site.searchInputPlaceholder}" (${site.searchInputPlaceholder.length})`)
    expect(tooLong, `searchInputPlaceholder is over ${MAX_SEARCH_EXAMPLE_LENGTH} characters`).toEqual([])
  })
})
