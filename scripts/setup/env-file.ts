/**
 * Edit a `.env` file's text, keeping its comments and order: replace each key's existing
 * `KEY=…` line (the first, if repeated), or append `KEY="value"` at the end.
 */
export function setEnvValues(content: string, values: Record<string, string>): string {
  const lines = content.split('\n');
  const pending = new Map(Object.entries(values));

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match && pending.has(match[1])) {
      lines[i] = formatEnvLine(match[1], pending.get(match[1])!);
      pending.delete(match[1]);
    }
  }

  if (pending.size === 0) return lines.join('\n');
  const trailingNewline = content.length === 0 || content.endsWith('\n');
  const body = trailingNewline ? lines.slice(0, -1) : lines;
  return [...body, ...[...pending].map(([key, value]) => formatEnvLine(key, value)), ''].join('\n');
}

function formatEnvLine(key: string, value: string): string {
  return /^[\w@%+=:,./-]*$/.test(value) ? `${key}=${value}` : `${key}="${value.replace(/"/g, '\\"')}"`;
}
