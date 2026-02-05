import { tool } from '../lib/plugin-stub';
import { analyzeDesignConsistency } from '../lib/kiro-utils';

export default tool({
  description: 'Validates consistency between requirements and design (Kiro specs).',
  args: {
    feature: tool.schema.string().describe('Target feature name'),
    deep: tool.schema.boolean().optional().describe('Perform deep semantic analysis (Not implemented yet)')
  },
  async execute({ feature, deep }) {
    if (deep) {
      // Future implementation for semantic check
    }

    const result = analyzeDesignConsistency(feature);

    if (result.status === 'ok' && result.issues.length === 0) {
      return `✅ Design consistency check passed for feature: ${feature}`;
    }

    const lines = [`### Design Issues for ${feature}`];
    
    if (result.status !== 'ok') {
       // Map status to readable message if needed, or just rely on issues list
       if (result.status === 'missing_req') {
           lines.push('⚠️ Missing Requirements Document');
       } else if (result.status === 'missing_design') {
           lines.push('⚠️ Missing Design Document');
       }
    }

    if (result.issues.length > 0) {
      lines.push('');
      result.issues.forEach(issue => { lines.push(`- ${issue}`); });
    }

    return lines.join('\n');
  }
});
