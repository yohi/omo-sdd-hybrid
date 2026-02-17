
export type BashCommandNode = {
  type: 'command';
  command: string;
  args: string[];
  tokens: string[];
};

export type BashNode = BashCommandNode | { type: 'complex'; reason: string; raw: string };

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

  /**
   * Extracts command substitutions $(...) and `...` from a string,
   * respecting quotes and escapes.
   */
  static extractSubstitutions(input: string): string[] {
    const substitutions: string[] = [];
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    let parenDepth = 0;
    let parenStart = -1;
    let backtickStart = -1;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];

      if (escaped) {
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

      // Command substitutions are NOT interpreted inside single quotes
      if (inSingle) continue;

      // $(...)
      if (ch === '$' && input[i + 1] === '(') {
        if (parenDepth === 0) parenStart = i + 2;
        parenDepth++;
        i++; // skip '('
        continue;
      }

      if (ch === ')' && parenDepth > 0) {
        parenDepth--;
        if (parenDepth === 0) {
          substitutions.push(input.substring(parenStart, i));
          parenStart = -1;
        }
        continue;
      }

      // Backticks `...`
      if (ch === '`') {
        if (backtickStart !== -1) {
          const content = input.substring(backtickStart, i);
          substitutions.push(content.replace(/\\`/g, '`'));
          backtickStart = -1;
        } else {
          backtickStart = i + 1;
        }
      }
    }

    return substitutions;
  }

  /**
   * Replaces command substitutions with a placeholder, respecting quotes.
   */
  static sanitizeSubstitutions(input: string, placeholder = '__SAFE_SUBST__'): string {
    let result = '';
    let lastIndex = 0;
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    let parenDepth = 0;
    let parenStart = -1;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];

      if (escaped) {
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

      if (inSingle) continue;

      if (ch === '$' && input[i + 1] === '(') {
        if (parenDepth === 0) {
          result += input.substring(lastIndex, i);
          parenStart = i;
        }
        parenDepth++;
        i++;
        continue;
      }

      if (ch === ')' && parenDepth > 0) {
        parenDepth--;
        if (parenDepth === 0) {
          result += placeholder;
          lastIndex = i + 1;
          parenStart = -1;
        }
        continue;
      }

      if (ch === '`' && parenDepth === 0) {
        // Find closing backtick
        let j = i + 1;
        let subEscaped = false;
        while (j < input.length) {
          if (subEscaped) {
            subEscaped = false;
          } else if (input[j] === '\\') {
            subEscaped = true;
          } else if (input[j] === '`') {
            break;
          }
          j++;
        }

        if (j < input.length) {
          result += input.substring(lastIndex, i) + placeholder;
          i = j;
          lastIndex = i + 1;
        }
      }
    }

    result += input.substring(lastIndex);
    return result;
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
          if (ch === ';' || ch === '\n' || ch === '\r') {
            pushSegment();
            continue;
          }
          if (ch === '|' || ch === '&') {
            const next = input[i + 1];
            if (next === ch) {
              pushSegment();
              i++;
              continue;
            }
            if (ch === '&' && next === '>') {
              current += ch;
              continue;
            }
            if (ch === '&' && current.length > 0 && current[current.length - 1] === '>') {
              current += ch;
              continue;
            }
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
    if (segment.includes('$(') || segment.includes('`') || segment.includes('<(') || segment.includes('>(')) {
      const subs = this.extractSubstitutions(segment);
      if (subs.length > 0 || segment.includes('<(') || segment.includes('>(')) {
        return { type: 'complex', reason: 'substitution_detected', raw: segment };
      }
    }
    if (segment.includes('<<')) {
       return { type: 'complex', reason: 'heredoc_detected', raw: segment };
    }

    const tokens = this.tokenize(segment);
    if (tokens.length === 0) {
      return { type: 'complex', reason: 'empty_segment', raw: segment };
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

      if (!inSingle && !inDouble && (/[><]/.test(ch) || (ch === '&' && segment[i + 1] === '>'))) {
        pushToken();
        let op = ch;
        if (ch === '&') {
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
