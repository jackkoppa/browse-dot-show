/**
 * Subscriber feeds often repeat the public feed's episodes (e.g. ad-free versions) alongside
 * subscriber-only ones. A subscriber episode's "public counterpart" is the public episode it's a
 * version of: same title (ignoring ad-free markers, punctuation and case) and published around
 * the same time. Counterparts aren't ingested as subscriber episodes, so search never shows an episode
 * twice. See scratchpad/subscriber-access/PLAN.md, "Duplicates".
 */

export interface PublicEpisodeForMatching {
  sequentialId: number;
  title: string;
  /** ISO 8601 */
  publishedAt: string;
}

export interface CounterpartMatch {
  episode: PublicEpisodeForMatching;
  how: 'title' | 'similar-title';
  daysApart: number;
}

/**
 * Same title: published within this many days counts as the same episode. Generous, because
 * subscribers may get episodes early; recurring titles (e.g. "Mailbag") go to the closest date.
 */
const MAX_DAYS_APART_SAME_TITLE = 14;
/** Similar title (e.g. a typo fixed in one feed): must be published within a couple of days */
const MAX_DAYS_APART_SIMILAR_TITLE = 2;
/** Dice coefficient of the titles' words, for "similar" */
const SIMILAR_TITLE_THRESHOLD = 0.85;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Markers subscriber feeds add to titles, e.g. "(Ad-Free)", "[AD FREE]", "Ad-free: " */
const AD_FREE_MARKER = /[[(]\s*(?:ad[\s-]*free|no\s+ads|subscriber(?:\s+edition)?)\s*[\])]|^\s*ad[\s-]*free\s*[:|-]\s*|\s*[:|-]\s*ad[\s-]*free\s*$/gi;

export function normalizeEpisodeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents: "Clichés" -> "Cliches"
    .replace(AD_FREE_MARKER, ' ')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function diceCoefficient(a: string, b: string): number {
  const wordsA = a.split(' ').filter(Boolean);
  const wordsB = new Set(b.split(' ').filter(Boolean));
  if (wordsA.length === 0 || wordsB.size === 0) return 0;
  const shared = new Set(wordsA.filter(word => wordsB.has(word))).size;
  return (2 * shared) / (new Set(wordsA).size + wordsB.size);
}

/**
 * Builds a matcher over the public episodes. Each public episode matches at most one subscriber
 * episode (the first one checked), so two subscriber episodes are never both treated as versions
 * of the same public one.
 */
export function createCounterpartMatcher(publicEpisodes: PublicEpisodeForMatching[]) {
  const candidates = publicEpisodes.map(episode => ({
    episode,
    normalizedTitle: normalizeEpisodeTitle(episode.title),
    time: new Date(episode.publishedAt).getTime(),
  }));
  const claimed = new Set<number>();

  return function findPublicCounterpart(title: string, publishedAt: Date): CounterpartMatch | null {
    const normalizedTitle = normalizeEpisodeTitle(title);
    const time = publishedAt.getTime();
    let best: CounterpartMatch | null = null;

    for (const candidate of candidates) {
      if (claimed.has(candidate.episode.sequentialId) || Number.isNaN(candidate.time)) continue;
      const daysApart = Math.abs(candidate.time - time) / DAY_MS;
      let how: CounterpartMatch['how'] | null = null;
      if (candidate.normalizedTitle === normalizedTitle && daysApart <= MAX_DAYS_APART_SAME_TITLE) {
        how = 'title';
      } else if (daysApart <= MAX_DAYS_APART_SIMILAR_TITLE && diceCoefficient(candidate.normalizedTitle, normalizedTitle) >= SIMILAR_TITLE_THRESHOLD) {
        how = 'similar-title';
      }
      if (!how) continue;
      // Prefer exact titles, then the closest date
      if (!best || (how === 'title' && best.how !== 'title') || (how === best.how && daysApart < best.daysApart)) {
        best = { episode: candidate.episode, how, daysApart };
      }
    }

    if (best) claimed.add(best.episode.sequentialId);
    return best;
  };
}
