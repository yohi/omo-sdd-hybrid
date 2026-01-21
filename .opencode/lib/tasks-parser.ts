const TASK_REGEX = /^\* \[([ x])\] ([A-Za-z][A-Za-z0-9_-]*-\d+): (.+?) \(Scope: (.+)\)$/;
const BACKTICK_SCOPE_REGEX = /`([^`]+)`/g;

export type ScopeFormat = 'lenient' | 'strict';

export function getScopeFormat(): ScopeFormat {
  const format = process.env.SDD_SCOPE_FORMAT;
  return format === 'strict' ? 'strict' : 'lenient';
}

export class ScopeFormatError extends Error {
  taskId?: string;
  scopeStr: string;
  
  constructor(scopeStr: string, taskId?: string) {
    super(`E_SCOPE_FORMAT: Scope はバッククォートで囲む必要があります。例: \`${scopeStr.trim()}\``);
    this.name = 'ScopeFormatError';
    this.scopeStr = scopeStr;
    this.taskId = taskId;
  }
}

export interface ParsedTask {
  id: string;
  title: string;
  scopes: string[];
  done: boolean;
}

export function parseScopes(scopeStr: string, format: ScopeFormat = getScopeFormat()): string[] {
  const backtickMatches = [...scopeStr.matchAll(BACKTICK_SCOPE_REGEX)];
  if (backtickMatches.length > 0) {
    return backtickMatches.map(m => m[1]).filter(Boolean);
  }
  
  if (/^[`\s,]*$/.test(scopeStr)) {
    return [];
  }
  
  if (format === 'strict') {
    throw new ScopeFormatError(scopeStr);
  }
  
  return scopeStr.split(/,\s*/).map(s => s.trim()).filter(Boolean);
}

export function parseTask(line: string, format: ScopeFormat = getScopeFormat()): ParsedTask | null {
  const match = line.match(TASK_REGEX);
  if (!match) return null;
  
  const [, checkbox, id, title, scopeStr] = match;
  try {
    const scopes = parseScopes(scopeStr, format);
    return { id, title, scopes, done: checkbox === 'x' };
  } catch (error) {
    if (error instanceof ScopeFormatError) {
      throw new ScopeFormatError(error.scopeStr, id);
    }
    throw error;
  }
}

export function parseTasksFile(content: string, format: ScopeFormat = getScopeFormat()): ParsedTask[] {
  const lines = content.split('\n');
  const tasks: ParsedTask[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === '') continue;
    if (trimmed.startsWith('#')) continue;
    
    const task = parseTask(trimmed, format);
    if (task) {
      tasks.push(task);
    }
  }
  
  return tasks;
}
