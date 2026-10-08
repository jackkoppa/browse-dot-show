import { describe, expect, it } from 'vitest';
import { planNeedsApproval, renderPlanComment, riskyChanges, summarizePlan, unapprovedChanges } from './plan-summary.js';

const plan = {
  resource_changes: [
    { address: 'module.search_lambda.aws_lambda_function.lambda', change: { actions: ['update'] } },
    { address: 'aws_s3_bucket.new', change: { actions: ['create'] } },
    { address: 'aws_iam_role.old', change: { actions: ['delete'] } },
    { address: 'aws_cloudfront_distribution.cdn', change: { actions: ['delete', 'create'] } },
    { address: 'data.aws_caller_identity.current', change: { actions: ['read'] } },
    { address: 'aws_s3_bucket.unchanged', change: { actions: ['no-op'] } },
  ],
};

describe('summarizePlan', () => {
  it('keeps addresses and actions only, mapping delete+create to replace', () => {
    expect(summarizePlan('site:alpha', plan)).toEqual({
      target: 'site:alpha',
      changes: [
        { address: 'module.search_lambda.aws_lambda_function.lambda', action: 'update' },
        { address: 'aws_s3_bucket.new', action: 'create' },
        { address: 'aws_iam_role.old', action: 'delete' },
        { address: 'aws_cloudfront_distribution.cdn', action: 'replace' },
      ],
    });
  });

  it('handles an empty plan', () => {
    expect(summarizePlan('homepage', {})).toEqual({ target: 'homepage', changes: [] });
  });
});

describe('unapprovedChanges', () => {
  const approved = summarizePlan('site:alpha', plan);

  it('allows the same plan, a subset of it, or extra in-place updates', () => {
    expect(unapprovedChanges(approved, approved)).toEqual([]);
    const subset = { target: 'site:alpha', changes: [{ address: 'aws_s3_bucket.new', action: 'create' as const }, { address: 'aws_x.y', action: 'update' as const }] };
    expect(unapprovedChanges(subset, approved)).toEqual([]);
  });

  it('flags new or different risky changes', () => {
    const fresh = { target: 'site:alpha', changes: [
      { address: 'aws_s3_bucket.new', action: 'replace' as const }, // was create
      { address: 'aws_lambda_function.extra', action: 'delete' as const },
    ] };
    expect(unapprovedChanges(fresh, approved)).toEqual(fresh.changes);
  });

  it('treats a missing approval as approving nothing risky', () => {
    expect(unapprovedChanges(approved, undefined)).toEqual(riskyChanges(approved));
  });
});

describe('renderPlanComment', () => {
  it('asks for approval and lists risky changes', () => {
    const comment = renderPlanComment([summarizePlan('site:alpha', plan), summarizePlan('site:beta', { resource_changes: [plan.resource_changes[0]] })], { marker: '<!-- m -->', runUrl: 'https://example/run' });
    expect(comment).toContain('<!-- m -->');
    expect(comment).toContain('**Needs approval:**');
    expect(comment).toContain('⚠️ Some resources are **created, replaced or destroyed**.');
    expect(comment).toContain('| `site:alpha` | 1 | 1 | 1 | 1 |');
    expect(comment).toContain('♻️ replace `aws_cloudfront_distribution.cdn`');
    expect(comment).toContain('2 in-place update(s)');
    expect(comment).toContain('https://example/run');
  });

  it('still asks for approval for in-place updates only, without the warning', () => {
    const comment = renderPlanComment([summarizePlan('site:beta', { resource_changes: [plan.resource_changes[0]] })], { marker: '<!-- m -->' });
    expect(comment).toContain('**Needs approval:**');
    expect(comment).toContain('Only in-place updates');
    expect(comment).not.toContain('⚠️');
  });

  it('needs no approval when no target changes', () => {
    const noChanges = [summarizePlan('site:alpha', { resource_changes: [] }), summarizePlan('site:beta', { resource_changes: [] })];
    expect(planNeedsApproval(noChanges)).toBe(false);
    const comment = renderPlanComment(noChanges, { marker: '<!-- m -->' });
    expect(comment).toContain('**No changes** in any of the 2 planned target(s), so no approval is needed.');
    expect(comment).not.toContain('Needs approval');
    expect(comment).not.toContain('| Target |');
  });

  it('needs approval when any target changes', () => {
    expect(planNeedsApproval([summarizePlan('site:alpha', { resource_changes: [] }), summarizePlan('site:beta', { resource_changes: [plan.resource_changes[0]] })])).toBe(true);
  });
});
