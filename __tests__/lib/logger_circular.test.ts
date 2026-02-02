import { describe, it, expect } from 'bun:test';
import { logger } from '../../.opencode/lib/logger';

describe('Logger Circular Reference', () => {
  it('should handle circular references without stack overflow', () => {
    const circular: any = { name: 'circular' };
    circular.self = circular;

    // This is expected to throw RangeError: Maximum call stack size exceeded before fix
    expect(() => {
        logger.info('Circular object:', circular);
    }).not.toThrow();
  });
});
