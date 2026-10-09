/**
 * Episode IDs as strings, as in search entries (`sequentialEpisodeIdAsString`) and episode URLs
 * (`/episode/<id>`). Public episodes use their manifest's sequential ID (`123`); subscriber-only
 * episodes have their own manifest and sequence, prefixed with `s` (`s12`), so the two never clash.
 */

export const SUBSCRIBER_EPISODE_ID_PREFIX = 's';

export interface ParsedEpisodeId {
  scope: 'public' | 'subscriber';
  sequentialId: number;
}

export function formatEpisodeId(sequentialId: number, scope: ParsedEpisodeId['scope'] = 'public'): string {
  return scope === 'subscriber' ? `${SUBSCRIBER_EPISODE_ID_PREFIX}${sequentialId}` : String(sequentialId);
}

/** null for anything that isn't `123` or `s123` */
export function parseEpisodeId(id: string): ParsedEpisodeId | null {
  const match = /^(s?)([1-9]\d*)$/.exec(id);
  if (!match) return null;
  return { scope: match[1] ? 'subscriber' : 'public', sequentialId: Number(match[2]) };
}
