export type Severity = 'error' | 'warning' | 'info';

export type FailOnLevel = Severity | 'none';

export type RuleCategory = 'env' | 'command' | 'shell' | 'path' | 'safety';

export type OutputFormat = 'text' | 'json';

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  info: 1,
  warning: 2,
  error: 3,
};

export interface RuleMatch {
  /** Short snippet or token that triggered the rule (bounded in length). */
  matched: string;
  /** Optional 0-based character offset within the script string. */
  offset?: number;
  /** Optional custom message overriding or augmenting the default explanation. */
  detail?: string;
}

export interface RuleContext {
  /** Parsed command segments for the script. */
  segments: readonly CommandSegment[];
}

export interface RuleDefinition {
  /** Stable rule identifier, e.g. PC001. */
  id: string;
  /** Kebab-case slug, e.g. unix-env-assignment. */
  slug: string;
  /** Short human-readable title. */
  title: string;
  /** Rule category. */
  category: RuleCategory;
  /** Default severity level. */
  severity: Severity;
  /** Whether detection relies on heuristics rather than exact syntax. */
  heuristic: boolean;
  /** Clear explanation of why this pattern may fail or behave differently across OSes. */
  explanation: string;
  /** Safe, portable alternative recommendation. */
  suggestion: string;
  /** Pure static check function. Must never execute commands or perform I/O. */
  check(scriptName: string, scriptValue: string, context: RuleContext): RuleMatch[];
}

export interface CommandSegment {
  /** Raw text of this command segment. */
  raw: string;
  /** 0-based start offset in the original script string. */
  offset: number;
  /** Leading inline env assignments (e.g. ["NODE_ENV=production"]). */
  envAssignments: string[];
  /** Command executable name (first non-env token), if any. */
  command: string | undefined;
  /** Arguments following the command name. */
  args: string[];
  /** All tokens in this segment. */
  tokens: ScriptToken[];
  /** Operator that followed this segment (e.g. '&&', '||', ';', '|', '&'). */
  trailingOperator?: string;
}

export interface ScriptToken {
  /** Token text (quotes preserved in raw, stripped in value). */
  raw: string;
  /** Unquoted value. */
  value: string;
  /** Quote style if quoted. */
  quote: 'none' | 'single' | 'double';
  /** 0-based start offset in the original script string. */
  offset: number;
}

export interface Diagnostic {
  ruleId: string;
  slug: string;
  title: string;
  category: RuleCategory;
  severity: Severity;
  heuristic: boolean;
  scriptName: string;
  scriptPreview: string;
  matched: string;
  offset?: number;
  explanation: string;
  suggestion: string;
}

export interface PortacheckConfig {
  /** Rule IDs or slugs to suppress globally. */
  ignoreRules?: string[];
  /** Script names to skip completely. */
  ignoreScripts?: string[];
  /** Per-rule severity overrides or disablement ('off'). */
  rules?: Record<string, Severity | 'off'>;
}

export interface ScanSummary {
  scriptsScanned: number;
  totalFindings: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  truncated: boolean;
}

export interface ScanResult {
  tool: 'portacheck';
  version: string;
  targetPath: string;
  packageName: string | undefined;
  diagnostics: Diagnostic[];
  summary: ScanSummary;
  warnings: string[];
}

export interface CliOptions {
  path: string;
  format: OutputFormat;
  failOn: FailOnLevel;
  help: boolean;
  version: boolean;
}

export type ExitCode = 0 | 1 | 2;
