import type { Site } from '../lib/sites.js';

/** Pipeline phases, in run order. `id` is what `--skip=` takes. */
export const PIPELINE_PHASES = [
  { id: 'pre-sync', key: 'preSync', title: 'Phase 1: Pre-sync (download files from S3 missing locally)' },
  { id: 'rss', key: 'rssRetrieval', title: 'Phase 2: RSS retrieval (download new episodes)' },
  { id: 'transcribe', key: 'audioProcessing', title: 'Phase 3: Transcription' },
  { id: 'index', key: 'localIndexing', title: 'Phase 4: Local search indexing' },
  { id: 's3-sync', key: 's3Sync', title: 'Phase 5: Upload new files to S3 (+ refresh search lambda)' },
  { id: 'cloudfront', key: 'cloudfrontInvalidation', title: 'Phase 6: CloudFront invalidation' },
] as const;

export type PipelinePhaseId = (typeof PIPELINE_PHASES)[number]['id'];
export type PipelinePhaseKey = (typeof PIPELINE_PHASES)[number]['key'];
export const PIPELINE_PHASE_IDS = PIPELINE_PHASES.map(phase => phase.id) as PipelinePhaseId[];

export interface PipelineConfig {
  sites: Site[];
  dryRun: boolean;
  forceLocalIndexing: boolean;
  reapplySpellingCorrections: boolean;
  /** Parallel transcription workers. */
  parallel: number;
  phases: Record<PipelinePhaseKey, boolean>;
}

/** Phases enabled unless listed in `skip`. */
export function phasesExcept(skip: PipelinePhaseId[] = []): Record<PipelinePhaseKey, boolean> {
  return Object.fromEntries(PIPELINE_PHASES.map(phase => [phase.key, !skip.includes(phase.id)])) as Record<PipelinePhaseKey, boolean>;
}

export interface SiteProcessingResult {
  siteId: string;
  siteTitle: string;
  s3PreSyncSuccess?: boolean;
  s3PreSyncDuration?: number;
  s3PreSyncFilesDownloaded?: number;
  preConsistencyCheckSuccess?: boolean;
  preConsistencyCheckDuration?: number;
  filesMissingLocally?: number;
  rssRetrievalSuccess: boolean;
  rssRetrievalDuration: number;
  audioProcessingSuccess: boolean;
  audioProcessingDuration: number;
  newAudioFilesDownloaded: number;
  newEpisodesTranscribed: number;
  hasNewFiles: boolean; // Track if ANY new files were created during ingestion
  hasNewSrtFiles: boolean;
  spellingCorrectionsReapplicationSuccess?: boolean;
  spellingCorrectionsReapplicationDuration?: number;
  spellingCorrectionsFilesProcessed?: number;
  spellingCorrectionsTotalCorrections?: number;
  localIndexingSuccess?: boolean;
  localIndexingDuration?: number;
  localIndexingEntriesProcessed?: number;
  postConsistencyCheckSuccess?: boolean;
  postConsistencyCheckDuration?: number;
  filesToUpload?: number;
  filesInSync?: number;
  s3SyncSuccess?: boolean;
  s3SyncDuration?: number;
  s3SyncTotalFilesUploaded?: number;
  searchApiRefreshSuccess?: boolean;
  searchApiRefreshDuration?: number;
  cloudfrontInvalidationSuccess?: boolean;
  cloudfrontInvalidationDuration?: number;
  errors: string[];
}
