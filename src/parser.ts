import type { CommandSegment, ScriptToken } from './types.js';

const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=.*/;
const WRAPPER_COMMANDS = new Set(['cross-env', 'cross-env-shell', 'npx', 'bunx']);

/**
 * Tokenizes a script string into shell-like tokens and operator boundaries
 * without executing anything.
 */
export function parseScriptSegments(script: string): CommandSegment[] {
  const segments: CommandSegment[] = [];
  let currentTokens: ScriptToken[] = [];
  let segmentStart = -1;

  let i = 0;
  const len = script.length;

  const flushSegment = (endIndex: number, trailingOperator?: string): void => {
    if (currentTokens.length === 0 && !trailingOperator) {
      return;
    }
    const start = segmentStart >= 0 ? segmentStart : endIndex;
    const raw = script.slice(start, endIndex).trim();
    const segment = buildSegment(raw, start, currentTokens, trailingOperator);
    if (segment.tokens.length > 0 || trailingOperator) {
      segments.push(segment);
    }
    currentTokens = [];
    segmentStart = -1;
  };

  while (i < len) {
    const ch = script[i]!;

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Check multi-char and single-char operators outside quotes
    if (ch === '&' && script[i + 1] === '&') {
      flushSegment(i, '&&');
      i += 2;
      continue;
    }
    if (ch === '|' && script[i + 1] === '|') {
      flushSegment(i, '||');
      i += 2;
      continue;
    }
    if (ch === ';') {
      flushSegment(i, ';');
      i++;
      continue;
    }
    if (ch === '|' && script[i + 1] !== '&') {
      flushSegment(i, '|');
      i++;
      continue;
    }
    if (ch === '&' && script[i + 1] !== '>') {
      // Check if part of redirection like >&2 or 2>&1
      const prev = i > 0 ? script[i - 1] : '';
      if (prev !== '>') {
        flushSegment(i, '&');
        i++;
        continue;
      }
    }

    if (segmentStart < 0) {
      segmentStart = i;
    }

    // Read one token (may contain quoted substrings)
    const tokenStart = i;
    let rawToken = '';
    let valueToken = '';
    let quoteStyle: 'none' | 'single' | 'double' = 'none';

    while (i < len) {
      const c = script[i]!;
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        break;
      }
      if (
        c === ';' ||
        (c === '&' && script[i + 1] === '&') ||
        (c === '|' && script[i + 1] === '|')
      ) {
        break;
      }
      if (c === '|' && script[i + 1] !== '&') {
        break;
      }
      if (c === '&' && script[i + 1] !== '>' && (i === 0 || script[i - 1] !== '>')) {
        break;
      }

      if (c === "'") {
        if (quoteStyle === 'none' && rawToken.length === 0) {
          quoteStyle = 'single';
        }
        rawToken += c;
        i++;
        while (i < len && script[i] !== "'") {
          rawToken += script[i];
          valueToken += script[i];
          i++;
        }
        if (i < len && script[i] === "'") {
          rawToken += "'";
          i++;
        }
        continue;
      }

      if (c === '"') {
        if (quoteStyle === 'none' && rawToken.length === 0) {
          quoteStyle = 'double';
        }
        rawToken += c;
        i++;
        while (i < len && script[i] !== '"') {
          if (script[i] === '\\' && i + 1 < len) {
            rawToken += script[i]! + script[i + 1]!;
            valueToken += script[i + 1]!;
            i += 2;
            continue;
          }
          rawToken += script[i];
          valueToken += script[i];
          i++;
        }
        if (i < len && script[i] === '"') {
          rawToken += '"';
          i++;
        }
        continue;
      }

      if (c === '\\' && i + 1 < len) {
        rawToken += c + script[i + 1]!;
        valueToken += script[i + 1]!;
        i += 2;
        continue;
      }

      rawToken += c;
      valueToken += c;
      i++;
    }

    if (rawToken.length > 0) {
      currentTokens.push({
        raw: rawToken,
        value: valueToken,
        quote: quoteStyle,
        offset: tokenStart,
      });
    }
  }

  flushSegment(len);
  return segments;
}

function buildSegment(
  raw: string,
  offset: number,
  tokens: ScriptToken[],
  trailingOperator?: string,
): CommandSegment {
  const envAssignments: string[] = [];
  let idx = 0;

  while (idx < tokens.length) {
    const tok = tokens[idx]!;
    if (tok.quote === 'none' && ENV_ASSIGNMENT_RE.test(tok.value)) {
      envAssignments.push(tok.raw);
      idx++;
    } else {
      break;
    }
  }

  const command = tokens[idx]?.value;
  const args = tokens.slice(idx + 1).map((t) => t.value);

  const segment: CommandSegment = {
    raw,
    offset,
    envAssignments,
    command,
    args,
    tokens,
  };
  if (trailingOperator !== undefined) {
    segment.trailingOperator = trailingOperator;
  }
  return segment;
}

/**
 * Returns the effective command name and args after unwrapping cross-env / npx prefixes.
 */
export function unwrapCommand(segment: CommandSegment): {
  command: string | undefined;
  args: string[];
  wrappedByCrossEnv: boolean;
} {
  let command = segment.command;
  let args = segment.args;
  let wrappedByCrossEnv = false;

  if (!command) {
    return { command: undefined, args: [], wrappedByCrossEnv: false };
  }

  if (command === 'cross-env' || command === 'cross-env-shell') {
    wrappedByCrossEnv = true;
    let i = 0;
    while (i < args.length && ENV_ASSIGNMENT_RE.test(args[i]!)) {
      i++;
    }
    command = args[i];
    args = args.slice(i + 1);
  } else if (WRAPPER_COMMANDS.has(command)) {
    // e.g. npx rimraf dist
    let i = 0;
    while (i < args.length && args[i]!.startsWith('-')) {
      i++;
    }
    command = args[i];
    args = args.slice(i + 1);
  }

  return { command, args, wrappedByCrossEnv };
}
