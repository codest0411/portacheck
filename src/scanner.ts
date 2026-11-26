import fs from 'node:fs';
import path from 'node:path';
import { parseScriptSegments } from './parser.js';
import { RULES } from './rules.js';
import type {
  Diagnostic,
  PortacheckConfig,
  RuleDefinition,
  ScanResult,
  Severity,
} from './types.js';

export const TOOL_VERSION = '0.1.0';
export const MAX_PACKAGE_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_CONFIG_BYTES = 256 * 1024;
export const MAX_SCRIPT_LENGTH = 10_000;
export const MAX_DIAGNOSTICS = 500;
const MAX_PREVIEW_LENGTH = 160;
const MAX_MATCHED_LENGTH = 100;

export class ScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScanError';
  }
}

export interface AnalyzeOptions {
  targetPath?: string | undefined;
  packageName?: string | undefined;
  config?: PortacheckConfig | undefined;
  rules?: readonly RuleDefinition[] | undefined;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

function isInsideRoot(rootRealPath: string, candidateRealPath: string): boolean {
  const rel = path.relative(rootRealPath, candidateRealPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function safeReadFileInRoot(rootRealPath: string, fileName: string, maxBytes: number): string {
  const filePath = path.join(rootRealPath, fileName);
  let lstat: fs.Stats;
  try {
    lstat = fs.lstatSync(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new ScanError(`File not found: ${filePath}`);
    }
    throw new ScanError(`Cannot access ${filePath}: ${(err as Error).message}`);
  }

  let realFilePath: string;
  try {
    realFilePath = fs.realpathSync(filePath);
  } catch (err) {
    throw new ScanError(`Cannot resolve ${filePath}: ${(err as Error).message}`);
  }

  if (!isInsideRoot(rootRealPath, realFilePath)) {
    throw new ScanError(`Refusing to follow symlink outside scan root: ${fileName}`);
  }

  if (lstat.isDirectory()) {
    throw new ScanError(`Expected a file but found a directory: ${filePath}`);
  }

  const stat = fs.statSync(realFilePath);
  if (!stat.isFile()) {
    throw new ScanError(`Not a regular file: ${filePath}`);
  }
  if (stat.size > maxBytes) {
    throw new ScanError(
      `File ${fileName} exceeds maximum allowed size (${stat.size} > ${maxBytes} bytes).`,
    );
  }

  return fs.readFileSync(realFilePath, 'utf8');
}

function loadConfig(rootRealPath: string): PortacheckConfig {
  const configPath = path.join(rootRealPath, '.portacheckrc.json');
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const raw = safeReadFileInRoot(rootRealPath, '.portacheckrc.json', MAX_CONFIG_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ScanError(`Malformed .portacheckrc.json: ${(err as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ScanError('Invalid .portacheckrc.json: expected a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;
  const config: PortacheckConfig = {};

  if (Array.isArray(obj.ignoreRules)) {
    config.ignoreRules = obj.ignoreRules.filter((v): v is string => typeof v === 'string');
  }
  if (Array.isArray(obj.ignoreScripts)) {
    config.ignoreScripts = obj.ignoreScripts.filter((v): v is string => typeof v === 'string');
  }
  if (typeof obj.rules === 'object' && obj.rules !== null && !Array.isArray(obj.rules)) {
    const ruleOverrides: Record<string, Severity | 'off'> = {};
    for (const [k, v] of Object.entries(obj.rules as Record<string, unknown>)) {
      if (v === 'off' || v === 'error' || v === 'warning' || v === 'info') {
        ruleOverrides[k] = v;
      }
    }
    config.rules = ruleOverrides;
  }

  return config;
}

/**
 * Pure static analyzer for an in-memory `scripts` map.
 * Never executes scripts, never touches the filesystem or network.
 */
export function analyzeScripts(
  scripts: Record<string, unknown>,
  options: AnalyzeOptions = {},
): ScanResult {
  const rules = options.rules ?? RULES;
  const config = options.config ?? {};
  const ignoredRules = new Set(config.ignoreRules ?? []);
  const ignoredScripts = new Set(config.ignoreScripts ?? []);
  const ruleOverrides = config.rules ?? {};

  const diagnostics: Diagnostic[] = [];
  const warnings: string[] = [];
  let scriptsScanned = 0;
  let truncated = false;

  for (const [scriptName, rawValue] of Object.entries(scripts)) {
    if (ignoredScripts.has(scriptName)) {
      continue;
    }
    if (typeof rawValue !== 'string') {
      warnings.push(`Skipped non-string script "${scriptName}".`);
      continue;
    }

    scriptsScanned++;
    let scriptValue = rawValue;
    if (scriptValue.length > MAX_SCRIPT_LENGTH) {
      warnings.push(
        `Script "${scriptName}" exceeded ${MAX_SCRIPT_LENGTH} characters and was truncated for analysis.`,
      );
      scriptValue = scriptValue.slice(0, MAX_SCRIPT_LENGTH);
    }

    if (scriptValue.trim().length === 0) {
      continue;
    }

    const segments = parseScriptSegments(scriptValue);
    const context = { segments };

    for (const rule of rules) {
      if (ignoredRules.has(rule.id) || ignoredRules.has(rule.slug)) {
        continue;
      }
      const override = ruleOverrides[rule.id] ?? ruleOverrides[rule.slug];
      if (override === 'off') {
        continue;
      }
      const effectiveSeverity: Severity = override ?? rule.severity;

      const matches = rule.check(scriptName, scriptValue, context);
      for (const match of matches) {
        if (diagnostics.length >= MAX_DIAGNOSTICS) {
          truncated = true;
          break;
        }
        const diag: Diagnostic = {
          ruleId: rule.id,
          slug: rule.slug,
          title: rule.title,
          category: rule.category,
          severity: effectiveSeverity,
          heuristic: rule.heuristic,
          scriptName,
          scriptPreview: truncate(scriptValue, MAX_PREVIEW_LENGTH),
          matched: truncate(match.matched, MAX_MATCHED_LENGTH),
          explanation: match.detail ?? rule.explanation,
          suggestion: rule.suggestion,
        };
        if (match.offset !== undefined) {
          diag.offset = match.offset;
        }
        diagnostics.push(diag);
      }

      if (truncated) break;
    }

    if (truncated) break;
  }

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const d of diagnostics) {
    if (d.severity === 'error') errorCount++;
    else if (d.severity === 'warning') warningCount++;
    else infoCount++;
  }

  return {
    tool: 'portacheck',
    version: TOOL_VERSION,
    targetPath: options.targetPath ?? '.',
    packageName: options.packageName,
    diagnostics,
    summary: {
      scriptsScanned,
      totalFindings: diagnostics.length,
      errorCount,
      warningCount,
      infoCount,
      truncated,
    },
    warnings,
  };
}

/**
 * Reads `package.json` (and optional `.portacheckrc.json`) from `targetDir`
 * in read-only mode and statically analyzes its `scripts` field.
 */
export function scanDirectory(targetDir: string): ScanResult {
  const resolved = path.resolve(targetDir);
  let rootRealPath: string;
  try {
    rootRealPath = fs.realpathSync(resolved);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new ScanError(`Target directory does not exist: ${resolved}`);
    }
    throw new ScanError(`Cannot access target directory ${resolved}: ${(err as Error).message}`);
  }

  const rootStat = fs.statSync(rootRealPath);
  if (!rootStat.isDirectory()) {
    throw new ScanError(`Target path is not a directory: ${resolved}`);
  }

  const pkgRaw = safeReadFileInRoot(rootRealPath, 'package.json', MAX_PACKAGE_JSON_BYTES);
  let pkgJson: unknown;
  try {
    pkgJson = JSON.parse(pkgRaw);
  } catch (err) {
    throw new ScanError(`Malformed package.json: ${(err as Error).message}`);
  }

  if (typeof pkgJson !== 'object' || pkgJson === null || Array.isArray(pkgJson)) {
    throw new ScanError('Invalid package.json: expected a top-level JSON object.');
  }

  const pkgObj = pkgJson as Record<string, unknown>;
  const packageName = typeof pkgObj.name === 'string' ? pkgObj.name : undefined;
  const config = loadConfig(rootRealPath);

  if (pkgObj.scripts === undefined) {
    return analyzeScripts({}, { targetPath: rootRealPath, packageName, config });
  }

  if (
    typeof pkgObj.scripts !== 'object' ||
    pkgObj.scripts === null ||
    Array.isArray(pkgObj.scripts)
  ) {
    throw new ScanError('Invalid package.json: "scripts" must be an object.');
  }

  return analyzeScripts(pkgObj.scripts as Record<string, unknown>, {
    targetPath: rootRealPath,
    packageName,
    config,
  });
}
