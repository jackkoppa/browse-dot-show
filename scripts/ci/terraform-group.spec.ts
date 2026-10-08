import { describe, expect, it } from 'vitest';
import { mapWithConcurrency, renderGroupSummary, workDirFor } from './terraform-group.js';

describe('mapWithConcurrency', () => {
  it('runs at most `limit` at a time and keeps the input order', async () => {
    let running = 0;
    let maxRunning = 0;
    const results = await mapWithConcurrency([30, 10, 20, 5, 15], 2, async ms => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(resolve => setTimeout(resolve, ms));
      running--;
      return ms * 2;
    });
    expect(results).toEqual([60, 20, 40, 10, 30]);
    expect(maxRunning).toBe(2);
  });

  it('handles fewer items than the limit, and none', async () => {
    expect(await mapWithConcurrency([1], 4, async n => n)).toEqual([1]);
    expect(await mapWithConcurrency([], 4, async n => n)).toEqual([]);
  });
});

describe('workDirFor', () => {
  it('puts each target next to terraform/sites, at the same depth', () => {
    expect(workDirFor('site:haveaword')).toMatch(/\/terraform\/\.ci-site-haveaword$/);
  });
});

describe('renderGroupSummary', () => {
  it('lists each target with its result', () => {
    const summary = renderGroupSummary([
      { target: 'site:a', exitCode: 0, seconds: 40 },
      { target: 'site:b', exitCode: 1, seconds: 12 },
    ], 'plan');
    expect(summary).toContain('### Terraform plan: 1/2 succeeded');
    expect(summary).toContain('| `site:a` | ✅ | 40s |');
    expect(summary).toContain('| `site:b` | ❌ failed | 12s |');
  });
});
