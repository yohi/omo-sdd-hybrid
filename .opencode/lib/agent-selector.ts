import { SddTask } from './tasks_markdown';

export async function selectRoleForTask(task: SddTask): Promise<'architect' | 'implementer'> {
  if (/^KIRO-\d+$/.test(task.id)) {
    return 'architect';
  }

  const architectKeywords = ['specification', 'design', 'requirements', 'architect', '仕様', '設計', '要件'];
  const description = task.description.toLowerCase();

  const isArchitect = architectKeywords.some(keyword => description.includes(keyword.toLowerCase()));
  if (isArchitect) {
    return 'architect';
  }

  return 'architect';
}
