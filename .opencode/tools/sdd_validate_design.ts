import { tool } from '@opencode-ai/plugin';
import { analyzeDesignConsistency, analyzeDesignConsistencyDeep } from '../lib/kiro-utils';

export default tool({
  description: 'Validates consistency between requirements and design (Kiro specs).',
  args: {
    feature: tool.schema.string().describe('Target feature name'),
    deep: tool.schema.boolean().optional().describe('Perform deep semantic analysis using LLM')
  },
  async execute({ feature, deep }) {
    const result = deep 
      ? await analyzeDesignConsistencyDeep(feature)
      : analyzeDesignConsistency(feature);

    if (result.status === 'ok' && result.issues.length === 0) {
      return `✅ Design consistency check passed for feature: ${feature}`;
    }

    const lines = [`### Design Issues for ${feature}`];
    
    if (result.status !== 'ok') {
       if (result.status === 'missing_req') {
           lines.push('⚠️ Missing Requirements Document');
       } else if (result.status === 'missing_design') {
           lines.push('⚠️ Missing Design Document');
       } else if (result.status === 'inconsistent') {
           lines.push('⚠️ Design inconsistency detected (Semantic Analysis)');
       } else if (result.status === 'error') {
           lines.push('❌ Analysis Error');
       }
    }

    if (result.issues.length > 0) {
      lines.push('');
      lines.push('**Issues:**');
      result.issues.forEach(issue => { lines.push(`- ${issue}`); });
    }

    if (result.suggestions && result.suggestions.length > 0) {
      lines.push('');
      lines.push('**Suggestions:**');
      result.suggestions.forEach(suggestion => { lines.push(`- ${suggestion}`); });
    }

    return lines.join('\n');
  }
});
