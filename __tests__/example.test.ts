import { describe, test, expect } from 'bun:test';

describe('Test Infrastructure', () => {
  test('bun test works', () => {
    expect(1 + 1).toBe(2);
  });

  test('imports work', async () => {
    const { z } = await import('zod');
    const schema = z.string();
    expect(schema.parse('hello')).toBe('hello');
  });
});
