import prompts from 'prompts';
import { UsageError } from './args.js';
import {
  discoverSites as discoverSiteConfigs,
  getSiteDirectory,
  type SiteConfig,
} from '@browse-dot-show/sites';

export { getSiteDirectory, type SiteConfig };

/** The subset of a site's config that scripts use for listing and prompts. */
export interface Site {
  id: string;
  domain: string;
  title: string;
  description: string;
}

function toSite(config: SiteConfig): Site {
  return {
    id: config.id,
    domain: config.domain,
    title: config.appHeader.primaryTitle,
    description: config.socialAndMetadata.metaDescription,
  };
}

/**
 * All available sites. Sites in `sites/my-sites/` take precedence: if there are any,
 * `sites/origin-sites/` is ignored entirely.
 */
export function discoverSites(): Site[] {
  return discoverSiteConfigs().map(toSite);
}

/** True when both stdin and stdout are a terminal, i.e. it's safe to prompt. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export interface ResolveSitesOptions {
  /** Site IDs given explicitly, e.g. from `--sites=a,b` or `--site=a`. */
  sites?: string[];
  /** Select every site, e.g. from `--all-sites`. */
  allSites?: boolean;
  /** Allow prompting when nothing was given. Defaults to `isInteractive()`. */
  interactive?: boolean;
  /** Allow choosing more than one site in the prompt. */
  multiple?: boolean;
  /** Shown in the prompt, e.g. "deployment". */
  operation?: string;
  /** Override site discovery (used in tests). */
  available?: Site[];
}

/**
 * Resolve which sites a command should act on.
 *
 * Explicit `sites` or `allSites` always win. Otherwise, prompt if interactive; if not
 * interactive, throw a `UsageError` so unattended runs fail fast instead of hanging.
 * Returns `[]` if the user cancels the prompt.
 */
export async function resolveSites(options: ResolveSitesOptions = {}): Promise<Site[]> {
  const {
    sites,
    allSites = false,
    interactive = isInteractive(),
    multiple = true,
    operation = 'this operation',
  } = options;
  const available = options.available ?? discoverSites();

  if (available.length === 0) {
    throw new UsageError('No sites found. Create a site in sites/my-sites/ or sites/origin-sites/.');
  }

  if (allSites) {
    if (!multiple) throw new UsageError(`--all-sites isn't supported for ${operation}; pass --site=<id>.`);
    return available;
  }

  if (sites && sites.length > 0) {
    const unknown = sites.filter(id => !available.some(site => site.id === id));
    if (unknown.length > 0) {
      throw new UsageError(
        `Unknown site(s): ${unknown.join(', ')}. Available: ${available.map(s => s.id).join(', ')}`
      );
    }
    if (!multiple && sites.length > 1) {
      throw new UsageError(`Only one site can be used for ${operation}; got ${sites.join(', ')}.`);
    }
    return sites.map(id => available.find(site => site.id === id)!);
  }

  if (available.length === 1) return available;

  if (!interactive) {
    throw new UsageError(
      multiple
        ? `No sites given for ${operation}. Pass --sites=<id,...> or --all-sites.`
        : `No site given for ${operation}. Pass --site=<id>.`
    );
  }

  return multiple ? promptForSites(available, operation) : promptForSite(available, operation);
}

/** Resolve exactly one site. See `resolveSites`. Returns null if the user cancels. */
export async function resolveSite(
  options: Omit<ResolveSitesOptions, 'sites' | 'allSites' | 'multiple'> & { site?: string } = {}
): Promise<Site | null> {
  const { site, ...rest } = options;
  const [resolved] = await resolveSites({ ...rest, sites: site ? [site] : undefined, multiple: false });
  return resolved ?? null;
}

function siteChoice(site: Site) {
  return { title: `${site.title} (${site.id})`, description: site.domain, value: site.id };
}

async function promptForSite(available: Site[], operation: string): Promise<Site[]> {
  const { siteId } = await prompts({
    type: 'autocomplete',
    name: 'siteId',
    message: `Select site for ${operation}:`,
    choices: available.map(siteChoice),
    suggest: async (input: string, choices: prompts.Choice[]) =>
      choices.filter(choice => `${choice.title}`.toLowerCase().includes(input.toLowerCase())),
  });
  const site = available.find(s => s.id === siteId);
  return site ? [site] : [];
}

async function promptForSites(available: Site[], operation: string): Promise<Site[]> {
  const { mode } = await prompts({
    type: 'select',
    name: 'mode',
    message: `Which sites for ${operation}?`,
    choices: [
      { title: `All sites (${available.length})`, value: 'all' },
      { title: 'Choose sites', value: 'choose' },
    ],
  });
  if (mode === 'all') return available;
  if (mode !== 'choose') return [];

  const { siteIds } = await prompts({
    type: 'autocompleteMultiselect',
    name: 'siteIds',
    message: 'Select sites (type to filter, space to select):',
    choices: available.map(siteChoice),
    min: 1,
  });
  return available.filter(site => (siteIds ?? []).includes(site.id));
}
