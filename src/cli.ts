import { parseArgs } from 'node:util';
import { formatJson, formatText } from './reporters.js';
import { ScanError, scanDirectory, TOOL_VERSION } from './scanner.js';
import { SEVERITY_RANK, type CliOptions, type ExitCode, type FailOnLevel } from './types.js';

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const DEFAULT_IO: CliIO = {
  stdout: (text: string) => console.log(text),
  stderr: (text: string) => console.error(text),
};

export function getHelpText(): string {
  return [
    `portacheck v${TOOL_VERSION} — Static cross-platform analyzer for package.json scripts`,
    '',
    'Usage:',
    '  portacheck [options]',
    '',
    'Options:',
    '  -p, --path <dir>       Directory containing package.json (default: ".")',
    '  -f, --format <fmt>     Output format: "text" or "json" (default: "text")',
    '      --fail-on <level>  Minimum severity to exit with code 1:',
    '                         "error" | "warning" | "info" | "none" (default: "info")',
    '  -h, --help             Show this help message',
    '  -v, --version          Show version number',
    '',
    'Exit codes:',
    '  0  Scan completed with no findings at or above --fail-on severity',
    '  1  Scan completed and findings were reported at or above --fail-on severity',
    '  2  Invalid arguments, unreadable input, or operational error',
  ].join('\n');
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: {
      path: { type: 'string', short: 'p', default: '.' },
      format: { type: 'string', short: 'f', default: 'text' },
      'fail-on': { type: 'string', default: 'info' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (positionals.length > 0) {
    throw new ScanError(`Unexpected positional argument(s): ${positionals.join(', ')}`);
  }

  const format = values.format;
  if (format !== 'text' && format !== 'json') {
    throw new ScanError(`Invalid --format "${format}". Expected "text" or "json".`);
  }

  const failOn = values['fail-on'];
  if (failOn !== 'error' && failOn !== 'warning' && failOn !== 'info' && failOn !== 'none') {
    throw new ScanError(
      `Invalid --fail-on "${failOn}". Expected "error", "warning", "info", or "none".`,
    );
  }

  return {
    path: values.path ?? '.',
    format,
    failOn,
    help: values.help ?? false,
    version: values.version ?? false,
  };
}

function shouldFail(
  failOn: FailOnLevel,
  severities: readonly ('error' | 'warning' | 'info')[],
): boolean {
  if (failOn === 'none') return false;
  const threshold = SEVERITY_RANK[failOn];
  return severities.some((s) => SEVERITY_RANK[s] >= threshold);
}

export function runCli(argv: readonly string[], io: CliIO = DEFAULT_IO): ExitCode {
  let options: CliOptions;
  try {
    options = parseCliArgs(argv);
  } catch (err) {
    io.stderr(`Error: ${(err as Error).message}`);
    io.stderr('Run "portacheck --help" for usage information.');
    return 2;
  }

  if (options.help) {
    io.stdout(getHelpText());
    return 0;
  }

  if (options.version) {
    io.stdout(TOOL_VERSION);
    return 0;
  }

  try {
    const result = scanDirectory(options.path);
    const output = options.format === 'json' ? formatJson(result) : formatText(result);
    io.stdout(output);

    const hasFailingFindings = shouldFail(
      options.failOn,
      result.diagnostics.map((d) => d.severity),
    );
    return hasFailingFindings ? 1 : 0;
  } catch (err) {
    if (err instanceof ScanError) {
      io.stderr(`Error: ${err.message}`);
    } else {
      io.stderr(`Unexpected error: ${(err as Error).message}`);
    }
    return 2;
  }
}
