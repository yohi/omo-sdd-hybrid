
export type BashCommandNode = {
  type: 'command';
  command: string;
  args: string[];
  tokens: string[];
};

export type BashNode = BashCommandNode | { type: 'complex'; reason: string };

/**
 * Robust Bash Parser without external dependencies.
 * Focuses on safe tokenization and AST-like traversal for destructive command detection.
 */
export class BashParser {
  /**
   * Parses a full bash command string into a list of segments/nodes.
   * Handles ;, &&, ||, pipes, and basic quoting.
   */
  static parse(input: string): BashNode[] {
    const segments = this.splitSegments(input);
    return segments.map(seg => this.parseSegment(seg));
  }

  private static splitSegments(input: string): string[] {
    const segments: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    let parenDepth = 0;
    let braceDepth = 0;

    const pushSegment = () => {
      const trimmed = current.trim();
      if (trimmed) segments.push(trimmed);
      current = '';
    };

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];

      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\' && !inSingle) {
        current += ch;
        escaped = true;
        continue;
      }

      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        current += ch;
        continue;
      }

      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        current += ch;
        continue;
      }

      if (!inSingle && !inDouble) {
        if (ch === '(') parenDepth++;
        if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);

        if (parenDepth === 0 && braceDepth === 0) {
          // Break at control operators
          if (ch === ';' || ch === '\n' || ch === '\r') {
            pushSegment();
            continue;
          }
            if (ch === '|' || ch === '&') {
            const next = input[i + 1];
            if (next === ch) { // && or ||
              pushSegment();
              i++;
              continue;
            }
            // Handle &> and &>> (redirection, not background)
            if (ch === '&' && next === '>') {
              current += ch;
              continue;
            }
            // pipe or background
            pushSegment();
            continue;
          }
        }
      }

      current += ch;
    }
    pushSegment();
    return segments;
  }

  private static parseSegment(segment: string): BashNode {
    // Check for complex constructs that we don't fully parse but should flag
    if (segment.includes('$(') || segment.includes('`') || segment.includes('<(') || segment.includes('>(')) {
      return { type: 'complex', reason: 'substitution_detected' };
    }
    if (segment.includes('<<')) {
       return { type: 'complex', reason: 'heredoc_detected' };
    }

    const tokens = this.tokenize(segment);
    if (tokens.length === 0) {
      return { type: 'complex', reason: 'empty_segment' };
    }

    return {
      type: 'command',
      command: tokens[0],
      args: tokens.slice(1),
      tokens: tokens
    };
  }

  private static tokenize(segment: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let escaped = false;

    const pushToken = () => {
      if (current) {
        tokens.push(this.unquote(current));
        current = '';
      }
    };

    for (let i = 0; i < segment.length; i++) {
      const ch = segment[i];

      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\' && !inSingle) {
        escaped = true;
        continue;
      }

      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        current += ch;
        continue;
      }

      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        current += ch;
        continue;
      }

      if (!inSingle && !inDouble && /\s/.test(ch)) {
        pushToken();
        continue;
      }

      // Handle redirections as separate tokens if not quoted
      if (!inSingle && !inDouble && (/[><]/.test(ch) || (ch === '&' && segment[i + 1] === '>'))) {
        pushToken();
        let op = ch;
        if (ch === '&') {
          // Handle &> and &>>
          if (segment[i + 1] === '>') {
            op += segment[i + 1];
            i++;
            if (segment[i + 1] === '>') {
              op += segment[i + 1];
              i++;
            }
          }
        } else {
          if (segment[i + 1] === ch || (ch === '>' && segment[i + 1] === '&')) {
            op += segment[i + 1];
            i++;
          }
        }
        tokens.push(op);
        continue;
      }

      current += ch;
    }
    pushToken();
    return tokens;
  }

  private static unquote(token: string): string {
    let result = '';
    let inSingle = false;
    let inDouble = false;
    let escaped = false;

    for (let i = 0; i < token.length; i++) {
      const ch = token[i];
      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\' && !inSingle) {
        escaped = true;
        continue;
      }
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        continue;
      }
      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        continue;
      }
      result += ch;
    }
    return result;
  }
}
