import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getSiteById } from '@browse-dot-show/sites';
import { REPO_ROOT } from './paths.js';
import { SUBSCRIBER_FOLDER } from './subscriber-access.js';

/**
 * Dummy data for `bds dev client --site=<id> --subscriber-demo`: a few made-up public episodes and
 * two subscriber-only ones, indexed by the real indexing lambda, in `.subscriber-demo/` (never the
 * real local files). Their transcripts share words ("pressing", "goalkeeper"), so a search shows
 * public and subscriber-only hits together once you're logged in.
 */

export const SUBSCRIBER_DEMO_ROOT = path.join(REPO_ROOT, '.subscriber-demo');

/** Ten minutes, so the public play-time limit (5 minutes) shows, and subscribers don't get it */
const DEMO_EPISODE_SECONDS = 600;

const PUBLIC_EPISODES = [
  { title: 'Demo episode: pressing, and why everyone does it now', topic: 'pressing' },
  { title: 'Demo episode: the goalkeeper who never caught a cross', topic: 'goalkeeper' },
  { title: 'Demo episode: false nines and other imaginary positions', topic: 'false nine' },
  { title: 'Demo episode: transfer deadline day, explained', topic: 'transfer deadline' },
];

const SUBSCRIBER_EPISODES = [
  { title: 'Subscriber bonus: the secret history of pressing', topic: 'pressing' },
  { title: 'Subscriber bonus: our all-time goalkeeper draft', topic: 'goalkeeper' },
];

export function demoSiteRoot(siteId: string, root = SUBSCRIBER_DEMO_ROOT): string {
  return path.join(root, 's3', 'sites', siteId);
}

export function hasSubscriberDemoData(siteId: string, root = SUBSCRIBER_DEMO_ROOT): boolean {
  const siteRoot = demoSiteRoot(siteId, root);
  return fs.existsSync(path.join(siteRoot, 'search-index', 'orama_index.msp')) &&
    fs.existsSync(path.join(siteRoot, SUBSCRIBER_FOLDER, 'search-index', 'orama_index.msp'));
}

function srtTime(seconds: number): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)},000`;
}

/** A made-up transcript: a cue every 20 seconds, mentioning the episode's topic now and then */
export function demoTranscript(topic: string, kind: 'public' | 'subscriber'): string {
  const lines = [
    `Welcome back to the show. Today it's all about ${topic}.`,
    'This is dummy data for testing subscriber access locally.',
    `Let's talk about ${topic} and what it means for the modern game.`,
    kind === 'subscriber' ? 'Thanks to our subscribers: this one is just for you.' : 'If you enjoy the show, tell a friend.',
    'A long tangent about a lower-league ground with a lovely tea hut.',
    `One more thought on ${topic} before the break.`,
  ];
  const cues: string[] = [];
  for (let start = 0, index = 0; start < DEMO_EPISODE_SECONDS; start += 20, index++) {
    cues.push(`${index + 1}\n${srtTime(start)} --> ${srtTime(start + 20)}\n${lines[index % lines.length]}\n`);
  }
  return cues.join('\n');
}

function fileKeyFor(title: string, publishedAt: Date): string {
  const slug = title.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 50);
  return `${publishedAt.toISOString().slice(0, 10)}_${slug}--${publishedAt.getTime()}`;
}

/** A silent MP3 (ffmpeg), so the player has something to play; skipped without ffmpeg */
function writeSilentMp3(file: string, seconds: number): boolean {
  const result = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', String(seconds), '-q:a', '9', file]);
  return result.status === 0;
}

/** Writes the demo's manifests, transcripts and audio for a site (replacing any earlier demo data) */
export function writeSubscriberDemoData(siteId: string, root = SUBSCRIBER_DEMO_ROOT, options: { audio?: boolean } = {}): { audio: boolean } {
  const site = getSiteById(siteId);
  if (!site) throw new Error(`Unknown site: ${siteId}`);
  const podcastId = site.subscriberAccess?.subscriberFeeds[0]?.podcastId ?? site.includedPodcasts[0].id;
  const siteRoot = demoSiteRoot(siteId, root);
  fs.rmSync(siteRoot, { recursive: true, force: true });

  let audio = options.audio ?? true;
  const write = (scopeRoot: string, episodes: typeof PUBLIC_EPISODES, kind: 'public' | 'subscriber', firstDaysAgo: number) => {
    const manifestEpisodes = episodes.map((episode, index) => {
      const publishedAt = new Date(Date.now() - (firstDaysAgo - index * 7) * 24 * 60 * 60 * 1000);
      publishedAt.setUTCHours(12, 0, 0, 0);
      const fileKey = fileKeyFor(episode.title, publishedAt);
      for (const dir of ['transcripts', 'audio']) fs.mkdirSync(path.join(scopeRoot, dir, podcastId), { recursive: true });
      fs.writeFileSync(path.join(scopeRoot, 'transcripts', podcastId, `${fileKey}.srt`), demoTranscript(episode.topic, kind));
      if (audio) audio = writeSilentMp3(path.join(scopeRoot, 'audio', podcastId, `${fileKey}.mp3`), DEMO_EPISODE_SECONDS);
      return {
        sequentialId: index + 1,
        podcastId,
        title: episode.title,
        fileKey,
        originalAudioURL: `https://example.com/demo/${fileKey}.mp3`,
        summary: `Dummy ${kind} episode for testing subscriber access locally.`,
        durationInSeconds: DEMO_EPISODE_SECONDS,
        publishedAt: publishedAt.toISOString(),
        hasCompletedLLMAnnotations: false,
        llmAnnotations: {},
      };
    });
    fs.mkdirSync(path.join(scopeRoot, 'episode-manifest'), { recursive: true });
    fs.writeFileSync(
      path.join(scopeRoot, 'episode-manifest', 'full-episode-manifest.json'),
      JSON.stringify({ lastUpdated: new Date().toISOString(), episodes: manifestEpisodes }, null, 2),
    );
  };

  write(siteRoot, PUBLIC_EPISODES, 'public', 40);
  write(path.join(siteRoot, SUBSCRIBER_FOLDER), SUBSCRIBER_EPISODES, 'subscriber', 30);
  return { audio };
}

/** Indexes the demo data with the real indexing lambda: public, then subscriber (which includes the public episodes) */
export function indexSubscriberDemoData(siteId: string, env: NodeJS.ProcessEnv): boolean {
  for (const scope of ['public', 'subscriber']) {
    const result = spawnSync('pnpm', ['--filter', '@browse-dot-show/srt-indexing-lambda', 'run:local'], {
      cwd: REPO_ROOT,
      env: { ...env, SITE_ID: siteId, CONTENT_SCOPE: scope, FILE_STORAGE_ENV: 'local', BDS_LOCAL_FILES_PATH: SUBSCRIBER_DEMO_ROOT, LOG_LEVEL: 'warn' },
      stdio: 'inherit',
    });
    if (result.status !== 0) return false;
  }
  // The indexing lambda reports failures in its result, not its exit code
  return hasSubscriberDemoData(siteId);
}
