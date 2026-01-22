import { describe, test, expect, spyOn } from 'bun:test';
import { SddGatekeeper } from '../../.opencode/plugins/sdd-gatekeeper';
import * as StateUtils from '../../.opencode/lib/state-utils';

// Mock state-utils to avoid file I/O dependence
// Using a simple mock since we just want to verify argument handling
const mockStateResult = {
  status: 'ok',
  state: {
    version: 1,
    activeTaskId: 'Task-1',
    activeTaskTitle: 'Test',
    allowedScopes: ['**'],
    startedAt: new Date().toISOString(),
    startedBy: 'test'
  }
};

describe('SddGatekeeper Entry Point', () => {
  test('handles tool event with undefined args gracefully', async () => {
    spyOn(StateUtils, 'readState').mockReturnValue(mockStateResult as any);

    const plugin = await SddGatekeeper({ client: {} as any });
    const handler = plugin['tool.execute.before'];

    if (!handler) {
      throw new Error('Handler not found');
    }
    
    // Simulate event with undefined args
    const event = {
      tool: {
        name: 'edit',
        args: undefined as any
      }
    };

    // Should not throw TypeError
    try {
      await handler(event);
    } catch (e: any) {
      // It might throw Error from evaluateAccess due to missing filePath (Rule1)
      // but it should NOT throw TypeError: undefined is not an object
      expect(e).toBeInstanceOf(Error);
      expect(e.message).not.toContain('undefined is not an object');
      // Depending on implementation, it might throw "[SDD-GATEKEEPER] MISSING_FILEPATH"
    }
  });

  test('handles multiedit with invalid files arg via entry point', async () => {
    spyOn(StateUtils, 'readState').mockReturnValue(mockStateResult as any);
    const plugin = await SddGatekeeper({ client: {} as any });
    const handler = plugin['tool.execute.before'];

    if (!handler) throw new Error('Handler not found');

    const event = {
      tool: {
        name: 'multiedit',
        args: {
          files: "not-an-array" // Invalid type
        }
      }
    };

    await expect(handler(event)).rejects.toThrow('INVALID_ARGUMENTS');
  });
});
