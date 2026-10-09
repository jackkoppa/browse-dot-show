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
  how: 'title' | 'similar-title' | 'title-part';
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
/**
 * A part of one title (split at ":" or " - ") with at least this many words, found whole in the
 * other title, within MAX_DAYS_APART_SAME_TITLE. E.g. subscriber "Dreamland, Episode 27: Paradise
 * with yesterday's newspaper - the joy of watching football on holiday" was released publicly as
 * "Free Dreamland episode: The joy of watching football on holiday".
 */
const MIN_TITLE_PART_WORDS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Markers subscriber feeds add to titles, e.g. "(Ad-Free)", "[AD FREE]", "Ad-free: " */
const AD_FREE_MARKER = /[[(]\s*(?:ad[\s-]*free|no\s+ads|subscriber(?:\s+edition)?)\s*[\])]|^\s*ad[\s-]*free\s*[:|-]\s*|\s*[:|-]\s*ad[\s-]*free\s*$/gi;

/** Normalized parts of a title, split at ":" and " - " (and similar dashes) */
function titleParts(title: string): string[] {
  return title
    .replace(AD_FREE_MARKER, ' ')
    .split(/:|\s[-–—]\s/)
    .map(normalizeEpisodeTitle)
    .filter(part => part.split(' ').length >= MIN_TITLE_PART_WORDS);
}

/** Whether a distinctive part of either title appears, as whole words, in the other */
function sharesTitlePart(a: { normalized: string; parts: string[] }, b: { normalized: string; parts: string[] }): boolean {
  const contains = (title: string, part: string) => ` ${title} `.includes(` ${part} `);
  return a.parts.some(part => contains(b.normalized, part)) || b.parts.some(part => contains(a.normalized, part));
}

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
    parts: titleParts(episode.title),
    time: new Date(episode.publishedAt).getTime(),
  }));
  const claimed = new Set<number>();

  return function findPublicCounterpart(title: string, publishedAt: Date): CounterpartMatch | null {
    const normalizedTitle = normalizeEpisodeTitle(title);
    const parts = titleParts(title);
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
      } else if (daysApart <= MAX_DAYS_APART_SAME_TITLE && sharesTitlePart({ normalized: normalizedTitle, parts }, { normalized: candidate.normalizedTitle, parts: candidate.parts })) {
        how = 'title-part';
      }
      if (!how) continue;
      // Prefer exact titles, then similar ones, then shared title parts; then the closest date
      const rank = { 'title': 0, 'similar-title': 1, 'title-part': 2 };
      if (!best || rank[how] < rank[best.how] || (how === best.how && daysApart < best.daysApart)) {
        best = { episode: candidate.episode, how, daysApart };
      }
    }

    if (best) claimed.add(best.episode.sequentialId);
    return best;
  };
}
