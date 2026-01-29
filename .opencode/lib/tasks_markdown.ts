import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

export interface SddTask {
  id: string;
  description: string;
  scopes: string[];
  rawScopeText?: string;
  checked: boolean;
  line: number;
}

export interface ParseError {
  line: number;
  reason: string;
  content: string;
}

export interface ParseResult {
  tasks: SddTask[];
  errors: ParseError[];
}

export interface TaskProgress {
  total: number;
  completed: number;
}

export function countMarkdownTasks(markdown: string): TaskProgress {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm);

  let tree: any;
  try {
    tree = processor.parse(markdown);
  } catch (e) {
    return { total: 0, completed: 0 };
  }

  let total = 0;
  let completed = 0;

  visit(tree, 'listItem', (node: any) => {
    if (node.checked !== null && node.checked !== undefined) {
      total++;
      if (node.checked) {
        completed++;
      }
    }
  });

  return { total, completed };
}

function getNodeText(node: any): string {
  if (node.value) return node.value;
  if (node.children) return node.children.map(getNodeText).join('');
  return '';
}

export function parseSddTasks(markdown: string, options: { validateScopes?: boolean } = { validateScopes: true }): ParseResult {
  const tasks: SddTask[] = [];
  const errors: ParseError[] = [];
  const lines = markdown.split('\n');

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm);

  let tree: any;
  try {
    tree = processor.parse(markdown);
  } catch (e: any) {
    errors.push({
      line: 0,
      reason: `Markdown Parse Error: ${e.message}`,
      content: ''
    });
    return { tasks, errors };
  }

  visit(tree, 'listItem', (node: any) => {
    if (node.checked === null || node.checked === undefined) {
      return;
    }

    const lineNo = node.position?.start.line || 0;
    const contentLine = lines[lineNo - 1] || '';

    const paragraph = node.children.find((c: any) => c.type === 'paragraph');
    
    if (!paragraph) {
      errors.push({
        line: lineNo,
        reason: 'フォーマットエラー: タスク行は "* [ ] TaskID: Description (Scope: `pattern`)" 形式である必要があります',
        content: contentLine
      });
      return;
    }

    let scopeStartNodeIndex = -1;
    let scopeStartTextIndex = -1;
    
    for (let i = 0; i < paragraph.children.length; i++) {
      const child = paragraph.children[i];
      if (child.type === 'text') {
        const text = child.value;
        const idx = text.indexOf(' (Scope: ');
        if (idx !== -1) {
          scopeStartNodeIndex = i;
          scopeStartTextIndex = idx;
          break;
        }
      }
    }

    if (scopeStartNodeIndex === -1) {
       const fullText = paragraph.children.map(getNodeText).join('');
       if (fullText.endsWith(' (Scope: ``)')) {
          errors.push({
            line: lineNo,
            reason: 'Scope が空です',
            content: contentLine
          });
          return;
       }

       errors.push({
        line: lineNo,
        reason: 'フォーマットエラー: タスク行は "* [ ] TaskID: Description (Scope: `pattern`)" 形式である必要があります',
        content: contentLine
      });
      return;
    }

    const fullText = paragraph.children.map(getNodeText).join('');
    if (!fullText.trim().endsWith(')')) {
       errors.push({
        line: lineNo,
        reason: 'フォーマットエラー: タスク行は "* [ ] TaskID: Description (Scope: `pattern`)" 形式である必要があります',
        content: contentLine
      });
      return;
    }

    const scopeSeparatorIndex = fullText.indexOf(' (Scope: ');
    const taskPart = fullText.substring(0, scopeSeparatorIndex);
    
    const colonIndex = taskPart.indexOf(': ');
    if (colonIndex === -1) {
       errors.push({
        line: lineNo,
        reason: 'フォーマットエラー: タスク行は "* [ ] TaskID: Description (Scope: `pattern`)" 形式である必要があります',
        content: contentLine
      });
      return;
    }

    const taskId = taskPart.substring(0, colonIndex).trim();
    const description = taskPart.substring(colonIndex + 2);

    let hasValidationError = false;

    if (!/^[A-Za-z0-9._-]+-\d+$/.test(taskId)) {
       errors.push({
        line: lineNo,
        reason: `TaskID のフォーマットエラー: "${taskId}" は "TaskID-N" または "PREFIX-N" 形式である必要があります`,
        content: contentLine
      });
      hasValidationError = true;
    }

    const scopes: string[] = [];
    const scopeNodes = paragraph.children.slice(scopeStartNodeIndex + 1);
    
    for (const child of scopeNodes) {
        if (child.type === 'inlineCode') {
            scopes.push(child.value);
        }
    }

    const rawScopeText = fullText.substring(scopeSeparatorIndex + ' (Scope: '.length, fullText.lastIndexOf(')'));
    const cleanScopes = scopes.map(s => s.trim()).filter(s => s.length > 0);

    if (options.validateScopes) {
        if (cleanScopes.length === 0) {
            const textWithoutBackticks = rawScopeText.replace(/`/g, '').trim();
            if (textWithoutBackticks.length === 0) {
                errors.push({
                    line: lineNo,
                    reason: 'Scope が空です',
                    content: contentLine
                });
                hasValidationError = true;
            } else {
                errors.push({
                    line: lineNo,
                    reason: 'フォーマットエラー: タスク行は "* [ ] TaskID: Description (Scope: `pattern`)" 形式である必要があります',
                    content: contentLine
                });
                hasValidationError = true;
            }
        }
    }

    if (!hasValidationError) {
      tasks.push({
        id: taskId,
        description: description,
        scopes: cleanScopes,
        rawScopeText: rawScopeText,
        checked: node.checked,
        line: lineNo
      });
    }
  });

  return { tasks, errors };
}

export function parseKiroTasks(markdown: string): ParseResult {
  const tasks: SddTask[] = [];
  const errors: ParseError[] = [];
  const lines = markdown.split('\n');

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm);

  let tree: any;
  try {
    tree = processor.parse(markdown);
  } catch (e: any) {
    errors.push({
      line: 0,
      reason: `Markdown Parse Error: ${e.message}`,
      content: ''
    });
    return { tasks, errors };
  }

  visit(tree, 'listItem', (node: any) => {
    if (node.checked === null || node.checked === undefined) {
      return;
    }

    const lineNo = node.position?.start.line || 0;

    const paragraph = node.children.find((c: any) => c.type === 'paragraph');
    
    if (!paragraph) {
      return;
    }

    const fullText = paragraph.children.map(getNodeText).join('');
    
    const colonIndex = fullText.indexOf(': ');
    if (colonIndex === -1) {
        return;
    }

    const id = fullText.substring(0, colonIndex).trim();
    const description = fullText.substring(colonIndex + 2).trim();

    if (!/^[A-Za-z][A-Za-z0-9._-]+-\d+$/.test(id)) {
        return;
    }

    tasks.push({
      id,
      description,
      scopes: [],
      checked: node.checked,
      line: lineNo
    });
  });

  return { tasks, errors };
}
