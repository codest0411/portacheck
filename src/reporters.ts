import type { ScanResult } from './types.js';

export function formatJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatText(result: ScanResult): string {
  const lines: string[] = [];
  const pkgLabel = result.packageName ? ` (${result.packageName})` : '';
  lines.push(`portacheck v${result.version} — ${result.targetPath}${pkgLabel}`);
  lines.push('');

  for (const warn of result.warnings) {
    lines.push(`Warning: ${warn}`);
  }
  if (result.warnings.length > 0) {
    lines.push('');
  }

  if (result.diagnostics.length === 0) {
    lines.push(`No portability issues found across ${result.summary.scriptsScanned} script(s).`);
    return lines.join('\n');
  }

  for (const d of result.diagnostics) {
    const tag = d.severity.toUpperCase();
    const heuristicNote = d.heuristic ? ' [heuristic]' : '';
    lines.push(`[${tag}] ${d.ruleId} (${d.slug})${heuristicNote} in script "${d.scriptName}"`);
    lines.push(`  Matched:    ${d.matched}`);
    lines.push(`  Script:     ${d.scriptPreview}`);
    lines.push(`  Why:        ${d.explanation}`);
    lines.push(`  Suggestion: ${d.suggestion}`);
    lines.push('');
  }

  const { summary } = result;
  lines.push(
    `Summary: ${summary.totalFindings} finding(s) in ${summary.scriptsScanned} script(s) ` +
      `(${summary.errorCount} error, ${summary.warningCount} warning, ${summary.infoCount} info)`,
  );
  if (summary.truncated) {
    lines.push('Note: Diagnostics were truncated at the maximum output limit.');
  }

  return lines.join('\n');
}
