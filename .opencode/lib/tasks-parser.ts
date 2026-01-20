const TASK_REGEX = /^\* \[([ x])\] ([A-Za-z][A-Za-z0-9_-]*-\d+): (.+?) \(Scope: (.+)\)$/;
const BACKTICK_SCOPE_REGEX = /`([^`]+)`/g;

export interface ParsedTask {
  id: string;
  title: string;
  scopes: string[];
  done: boolean;
}

function parseScopes(scopeStr: string): string[] {
  const backtickMatches = [...scopeStr.matchAll(BACKTICK_SCOPE_REGEX)];
  if (backtickMatches.length > 0) {
    return backtickMatches.map(m => m[1]);
  }
  
  return scopeStr.split(/,\s*/).map(s => s.trim()).filter(Boolean);
}

export function parseTask(line: string): ParsedTask | null {
  const match = line.match(TASK_REGEX);
  if (!match) return null;
  
  const [, checkbox, id, title, scopeStr] = match;
  const scopes = parseScopes(scopeStr);
  
  return { id, title, scopes, done: checkbox === 'x' };
}

export function parseTasksFile(content: string): ParsedTask[] {
  const lines = content.split('\n');
  const tasks: ParsedTask[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === '') continue;
    if (trimmed.startsWith('#')) continue;
    
    const task = parseTask(trimmed);
    if (task) {
      tasks.push(task);
    }
  }
  
  return tasks;
}
