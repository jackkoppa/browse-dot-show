import * as fs from 'fs';
import * as path from 'path';

/**
 * A search for a site's newest transcribed episode, for the Slack message: a link that opens
 * the deployed site's search with that episode as the first result, to check it transcribed
 * and plays.
 *
 * Search matches entries that contain every word of the query (`threshold: 0`), and "newest"
 * sorts all matches by publish date. So any words from one search entry of the site's newest
 * episode find that episode first. Common words are skipped because they make search slow.
 */

export interface NewestEpisodeSearch {
  title: string;
  query: string;
}

interface ManifestEpisode {
  podcastId: string;
  title: string;
  fileKey: string;
  publishedAt: string;
}

interface SearchEntry {
  text: string;
}

/** The newest episode (by publish date) with search entries, in a local site folder (`.../s3/sites/<id>`). */
export function findNewestEpisodeSearch(siteDir: string): NewestEpisodeSearch | null {
  const manifest = JSON.parse(fs.readFileSync(path.join(siteDir, 'episode-manifest', 'full-episode-manifest.json'), 'utf8'));
  const episodes = [...(manifest.episodes as ManifestEpisode[])].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  for (const episode of episodes) {
    const entriesPath = path.join(siteDir, 'search-entries', episode.podcastId, `${episode.fileKey}.json`);
    if (!fs.existsSync(entriesPath)) continue;
    const entries: SearchEntry[] = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
    const query = pickSearchPhrase(entries.map(entry => entry.text));
    return query ? { title: episode.title, query } : null;
  }
  return null;
}

/**
 * The first run of 4 (else 3, else 2) uncommon words within one entry, starting a quarter of
 * the way in (past intros and opening ads) and wrapping around.
 */
export function pickSearchPhrase(texts: string[], startFraction = 0.25): string | null {
  const start = Math.floor(texts.length * startFraction);
  const ordered = [...texts.slice(start), ...texts.slice(0, start)];
  for (const size of [4, 3, 2]) {
    for (const text of ordered) {
      const run = firstUncommonRun(text, size);
      if (run) return run.join(' ');
    }
  }
  return null;
}

function firstUncommonRun(text: string, size: number): string[] | null {
  let run: string[] = [];
  for (const token of text.split(/\s+/)) {
    // Plain words only: punctuation inside a word (it's, U.S., e-mail) tokenizes unpredictably
    const word = token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase();
    if (/^[a-z]{3,}$/.test(word) && !COMMON_WORDS.has(word)) {
      run.push(word);
      if (run.length === size) return run;
    } else {
      run = [];
    }
  }
  return null;
}

/** The deployed site's search for `query`, newest first. */
export function newestEpisodeSearchUrl(domain: string, query: string): string {
  return `https://${domain}/?${new URLSearchParams({ q: query, sort: 'newest' })}`;
}

// The most common English words, plus conversational filler common in transcripts
const COMMON_WORDS = new Set(`
  the be to of and a in that have i it for not on with he as you do at this but his by from they we say
  her she or an will my one all would there their what so up out if about who get which go me when make
  can like time no just him know take people into year your good some could them see other than then now
  look only come its over think also back after use two how our work first well way even new want because
  any these give day most us is are was were been being has had did does said says got going gonna get
  really very right yeah yes okay actually thing things lot much more something anything everything nothing
  little big great kind sort maybe mean means let lets those here where why should never always still own
  same each every both few many such through down off again before while again around between under too
  why tell told feel felt put made makes making went goes come came comes thought last next long need
  needs part show podcast episode today talk talking guys guy man pretty stuff whatever though through
  sure might must shall may ever able else okay right gotta wanna kinda basically literally totally
`.trim().split(/\s+/));
