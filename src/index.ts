export { runCli, parseCliArgs, getHelpText } from './cli.js';
export { parseScriptSegments, unwrapCommand } from './parser.js';
export { formatJson, formatText } from './reporters.js';
export { RULES, RULE_MAP } from './rules.js';
export {
  analyzeScripts,
  scanDirectory,
  ScanError,
  TOOL_VERSION,
  MAX_DIAGNOSTICS,
  MAX_PACKAGE_JSON_BYTES,
  MAX_SCRIPT_LENGTH,
} from './scanner.js';
export type {
  CliOptions,
  CommandSegment,
  Diagnostic,
  ExitCode,
  FailOnLevel,
  OutputFormat,
  PortacheckConfig,
  RuleCategory,
  RuleContext,
  RuleDefinition,
  RuleMatch,
  ScanResult,
  ScanSummary,
  ScriptToken,
  Severity,
} from './types.js';
