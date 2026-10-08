import * as fs from 'fs';
import * as path from 'path';
import type { SiteProcessingResult } from './types.js';

/**
 * A machine-readable summary of one pipeline run (`bds ingest --summary-json=<path>`).
 * Scheduled runs read it for notifications and `bds schedule status`.
 */
export interface PipelineRunSummary {
  version: 1;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  dryRun: boolean;
  exitCode: number;
  totals: SiteCounts & { sites: number; errors: number };
  sites: (SiteCounts & { siteId: string; errors: string[] })[];
}

interface SiteCounts {
  newAudioFiles: number;
  transcribed: number;
  filesUploaded: number;
}

export function buildRunSummary(
  results: SiteProcessingResult[],
  run: { startedAt: Date; endedAt: Date; dryRun: boolean; exitCode: number },
): PipelineRunSummary {
  const sites = results.map(result => ({
    siteId: result.siteId,
    newAudioFiles: result.newAudioFilesDownloaded,
    transcribed: result.newEpisodesTranscribed,
    filesUploaded: result.s3SyncTotalFilesUploaded ?? 0,
    errors: result.errors,
  }));
  const sum = (key: keyof SiteCounts) => sites.reduce((total, site) => total + site[key], 0);
  return {
    version: 1,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt.toISOString(),
    durationMs: run.endedAt.getTime() - run.startedAt.getTime(),
    dryRun: run.dryRun,
    exitCode: run.exitCode,
    totals: {
      sites: sites.length,
      newAudioFiles: sum('newAudioFiles'),
      transcribed: sum('transcribed'),
      filesUploaded: sum('filesUploaded'),
      errors: sites.reduce((total, site) => total + site.errors.length, 0),
    },
    sites,
  };
}

export function writeRunSummary(filePath: string, summary: PipelineRunSummary): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2) + '\n');
}

export function readRunSummary(filePath: string): PipelineRunSummary | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}
