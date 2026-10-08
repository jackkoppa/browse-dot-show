/**
 * Terraform plan summaries for GitHub Actions: which resources a plan creates, updates,
 * replaces or destroys, by address only.
 *
 * `terraform show -json` (and the binary tfplan) contain sensitive values in plain text, so
 * only these summaries leave the job (PR comments, artifacts); never the raw plan.
 */

export type PlanAction = 'create' | 'update' | 'replace' | 'delete';

export interface PlanChange {
  address: string;
  action: PlanAction;
}

export interface PlanSummary {
  /** `site:<id>` or `homepage`. */
  target: string;
  changes: PlanChange[];
}

/** Changes called out in the PR comment, and never applied without an approved plan. */
export const RISKY_ACTIONS: PlanAction[] = ['create', 'replace', 'delete'];

interface TerraformJsonPlan {
  resource_changes?: { address: string; change: { actions: string[] } }[];
}

function toAction(actions: string[]): PlanAction | undefined {
  if (actions.includes('create') && actions.includes('delete')) return 'replace';
  if (actions.includes('create')) return 'create';
  if (actions.includes('delete')) return 'delete';
  if (actions.includes('update')) return 'update';
  return undefined; // no-op, read
}

export function summarizePlan(target: string, plan: TerraformJsonPlan): PlanSummary {
  const changes = (plan.resource_changes ?? []).flatMap(resource => {
    const action = toAction(resource.change.actions);
    return action ? [{ address: resource.address, action }] : [];
  });
  return { target, changes };
}

export const riskyChanges = (summary: PlanSummary) => summary.changes.filter(change => RISKY_ACTIONS.includes(change.action));

/**
 * Risky changes in `fresh` that weren't in the approved plan. Empty means the fresh plan is
 * safe to apply: it only drops approved changes or adds in-place updates.
 */
export function unapprovedChanges(fresh: PlanSummary, approved: PlanSummary | undefined): PlanChange[] {
  const approvedKeys = new Set((approved ? riskyChanges(approved) : []).map(change => `${change.action} ${change.address}`));
  return riskyChanges(fresh).filter(change => !approvedKeys.has(`${change.action} ${change.address}`));
}

const ACTION_LABELS: Record<PlanAction, string> = { create: '➕ create', update: '🔄 update', replace: '♻️ replace', delete: '🗑️ destroy' };

/** A PR's plans need the developer's approval when any target would change. Plans with no changes
 *  don't: if AWS drifts before the merge, the deploy refuses to apply those targets anyway. */
export function planNeedsApproval(summaries: PlanSummary[]): boolean {
  return summaries.some(summary => summary.changes.length > 0);
}

/** The sticky PR comment for a set of plans. */
export function renderPlanComment(summaries: PlanSummary[], options: { runUrl?: string; marker: string }): string {
  const lines = [options.marker, '## Terraform plan', ''];
  const risky = summaries.some(summary => riskyChanges(summary).length > 0);

  if (summaries.length === 0) {
    lines.push('No Terraform changes in this PR.');
  } else if (!planNeedsApproval(summaries)) {
    const targets = summaries.map(summary => `\`${summary.target}\``).join(', ');
    lines.push(`**No changes** in any of the ${summaries.length} planned target(s), so no approval is needed. (If AWS changes before this merges, the deploy refuses to apply those targets.)`);
    lines.push('', `<details><summary>Planned targets</summary>`, '', targets, '', '</details>');
  } else {
    lines.push(
      `**Needs approval:** review the plans below, then approve the \`terraform-approval\` deployment in this PR's checks. Merging applies them. ${
        risky ? '⚠️ Some resources are **created, replaced or destroyed**.' : 'Only in-place updates (or no changes).'
      }`
    );
    lines.push('', '| Target | Create | Update | Replace | Destroy |', '| --- | --- | --- | --- | --- |');
    for (const summary of summaries) {
      const count = (action: PlanAction) => summary.changes.filter(change => change.action === action).length || '';
      lines.push(`| \`${summary.target}\` | ${count('create')} | ${count('update')} | ${count('replace')} | ${count('delete')} |`);
    }
    for (const summary of summaries) {
      const risky = riskyChanges(summary);
      if (risky.length === 0) continue;
      lines.push('', `<details open><summary><code>${summary.target}</code>: ${risky.length} to create, replace or destroy</summary>`, '');
      risky.forEach(change => lines.push(`- ${ACTION_LABELS[change.action]} \`${change.address}\``));
      lines.push('', '</details>');
    }
    const updates = summaries.flatMap(summary => summary.changes.filter(change => change.action === 'update').map(change => `\`${summary.target}\`: \`${change.address}\``));
    if (updates.length > 0) {
      lines.push('', `<details><summary>${updates.length} in-place update(s)</summary>`, '', ...updates.map(update => `- ${update}`), '', '</details>');
    }
  }
  if (options.runUrl) lines.push('', `Full plan output: [workflow run](${options.runUrl}) (job logs). Sensitive values are redacted by Terraform.`);
  return lines.join('\n') + '\n';
}
