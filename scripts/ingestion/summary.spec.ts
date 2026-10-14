import { describe, expect, it } from 'vitest';
import { formatDryRunSummary } from './summary.js';
import { phasesExcept, type PipelineConfig, type SiteProcessingResult } from './types.js';

const result = (siteId: string) => ({ siteId, siteTitle: siteId.toUpperCase() }) as SiteProcessingResult;
const config = (overrides: Partial<PipelineConfig> = {}): PipelineConfig => ({
  sites: [],
  dryRun: true,
  forceLocalIndexing: false,
  reapplySpellingCorrections: false,
  parallel: 1,
  phases: phasesExcept(),
  ...overrides,
});

describe('formatDryRunSummary', () => {
  it('lists the phases a real run would run and the sites, with no failure marks', () => {
    const text = formatDryRunSummary([result('a'), result('b')], config());
    expect(text).toContain('Phases a real run would run: pre-sync, rss, transcribe, index, s3-sync, cloudfront');
    expect(text).not.toContain('Skipped');
    expect(text).toContain('Sites (2):');
    expect(text).toContain('   b (B)');
    expect(text).not.toContain('❌');
  });

  it('lists skipped phases and spelling corrections', () => {
    const text = formatDryRunSummary([result('a')], config({ phases: phasesExcept(['transcribe', 'cloudfront']), reapplySpellingCorrections: true }));
    expect(text).toContain('would run: pre-sync, rss, index, s3-sync (+ reapplying spelling corrections)');
    expect(text).toContain('Skipped: transcribe, cloudfront');
  });
});
