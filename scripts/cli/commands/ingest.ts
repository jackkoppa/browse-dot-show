import prompts from 'prompts';
import { csv, parseFlags, positiveInt, UsageError } from '../../lib/args.js';
import { DEFAULT_TRANSCRIPTION_WORKERS, getDefaultTranscriptionWorkers } from '../../lib/machine-config.js';
import { discoverSites, resolveSites } from '../../lib/sites.js';
import { runPipeline } from '../../ingestion/pipeline.js';
import {
  PIPELINE_PHASES,
  PIPELINE_PHASE_IDS,
  phasesExcept,
  type PipelinePhaseId,
} from '../../ingestion/types.js';
import { printEquivalentCommand, type Command } from '../command.js';

const FLAGS = {
  sites: { type: 'string' },
  'all-sites': { type: 'boolean' },
  skip: { type: 'string' },
  parallel: { type: 'string' },
  'dry-run': { type: 'boolean' },
  'force-local-indexing': { type: 'boolean' },
  'reapply-spelling-corrections': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

function parseSkip(value: string | undefined): PipelinePhaseId[] {
  const skip = csv(value) ?? [];
  const unknown = skip.filter(id => !(PIPELINE_PHASE_IDS as string[]).includes(id));
  if (unknown.length > 0) {
    throw new UsageError(`Unknown phase(s) in --skip: ${unknown.join(', ')}. Phases: ${PIPELINE_PHASE_IDS.join(', ')}`);
  }
  return skip as PipelinePhaseId[];
}

interface IngestOptions {
  skip: PipelinePhaseId[];
  parallel: number;
  dryRun: boolean;
  forceLocalIndexing: boolean;
  reapplySpellingCorrections: boolean;
}

/** Ask how to run. Returns null if cancelled. */
async function promptForOptions(current: IngestOptions): Promise<IngestOptions | null> {
  const { mode } = await prompts({
    type: 'select',
    name: 'mode',
    message: 'How should it run?',
    choices: [
      { title: 'Full pipeline (all phases)', value: 'full' },
      { title: 'Dry run (show what would happen, no changes)', value: 'dry-run' },
      { title: 'Customize phases and options…', value: 'custom' },
    ],
  });
  if (!mode) return null;
  if (mode === 'full') return current;
  if (mode === 'dry-run') return { ...current, dryRun: true };

  const { selected } = await prompts({
    type: 'multiselect',
    name: 'selected',
    message: 'Select phases and options',
    choices: [
      ...PIPELINE_PHASES.map(phase => ({ title: phase.title, value: phase.id, selected: !current.skip.includes(phase.id) })),
      { title: 'Option: reapply spelling corrections to ALL existing transcripts', value: 'reapply', selected: current.reapplySpellingCorrections },
      { title: 'Option: re-index every selected site, even without new files', value: 'force-index', selected: current.forceLocalIndexing },
      { title: 'Option: dry run', value: 'dry-run', selected: current.dryRun },
    ],
    hint: 'space to toggle, enter to confirm',
  });
  if (!selected) return null;

  const skip = PIPELINE_PHASE_IDS.filter(id => !selected.includes(id));
  let parallel = current.parallel;
  if (!skip.includes('transcribe')) {
    ({ parallel } = await prompts({
      type: 'number',
      name: 'parallel',
      message: 'Parallel transcription workers',
      initial: current.parallel,
      min: 1,
      max: 8,
    }));
    if (!parallel) return null;
  }

  return {
    skip,
    parallel,
    reapplySpellingCorrections: selected.includes('reapply'),
    forceLocalIndexing: selected.includes('force-index'),
    dryRun: selected.includes('dry-run'),
  };
}

export const ingestCommand: Command = {
  path: ['ingest'],
  summary: 'Run the ingestion pipeline (RSS → transcribe → index → upload to S3 → invalidate CloudFront)',
  usage: `
USAGE
  pnpm bds ingest (--sites=a,b | --all-sites) [options]

OPTIONS
  --sites=a,b                      Sites to process
  --all-sites                      Process every site
  --skip=<phase,...>               Skip phases: ${PIPELINE_PHASE_IDS.join(', ')}
  --parallel=N                     Transcription workers across all selected sites (default:
                                   "transcriptionWorkers" in .local-files-config.json, else ${DEFAULT_TRANSCRIPTION_WORKERS})
  --dry-run                        Show what would happen; no downloads, transcription, uploads or AWS calls
  --reapply-spelling-corrections   Also reapply spelling corrections to ALL existing transcripts
  --force-local-indexing           Re-index every selected site, even without new files

PHASES
${PIPELINE_PHASES.map(phase => `  ${phase.id.padEnd(12)} ${phase.title}`).join('\n')}

  S3 phases use .env.automation (the automation IAM user) and assume
  browse-dot-show-automation-role in each site's account.

EXAMPLES
  pnpm bds ingest --all-sites --parallel=3
  pnpm bds ingest --sites=haveaword --dry-run
  pnpm bds ingest --sites=haveaword --skip=pre-sync,s3-sync,cloudfront   # local only
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, FLAGS);
    let options: IngestOptions = {
      skip: parseSkip(flags.skip),
      parallel: positiveInt('parallel', flags.parallel) ?? getDefaultTranscriptionWorkers(),
      dryRun: Boolean(flags['dry-run']),
      forceLocalIndexing: Boolean(flags['force-local-indexing']),
      reapplySpellingCorrections: Boolean(flags['reapply-spelling-corrections']),
    };

    const sitesGiven = Boolean(flags.sites || flags['all-sites']);
    const sites = await resolveSites({
      sites: csv(flags.sites),
      allSites: flags['all-sites'],
      interactive: ctx.interactive,
      operation: 'ingestion',
    });
    if (sites.length === 0) return 130;

    // Prompt for options only when the sites were also chosen interactively
    if (!sitesGiven && ctx.interactive) {
      const chosen = await promptForOptions(options);
      if (!chosen) return 130;
      options = chosen;
      printEquivalentCommand([
        'ingest',
        sites.length > 1 && sites.length === discoverSites().length
          ? '--all-sites'
          : `--sites=${sites.map(s => s.id).join(',')}`,
        ...(options.skip.length ? [`--skip=${options.skip.join(',')}`] : []),
        ...(options.skip.includes('transcribe') ? [] : [`--parallel=${options.parallel}`]),
        ...(options.dryRun ? ['--dry-run'] : []),
        ...(options.reapplySpellingCorrections ? ['--reapply-spelling-corrections'] : []),
        ...(options.forceLocalIndexing ? ['--force-local-indexing'] : []),
      ]);
    }

    return runPipeline({
      sites,
      dryRun: options.dryRun,
      forceLocalIndexing: options.forceLocalIndexing,
      reapplySpellingCorrections: options.reapplySpellingCorrections,
      parallel: options.parallel,
      phases: phasesExcept(options.skip),
    });
  },
};
