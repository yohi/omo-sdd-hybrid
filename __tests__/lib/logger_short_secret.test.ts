import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { logger, _reloadSecrets } from '../../.opencode/lib/logger';

describe('Logger Short Secret', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should mask short secrets if they match the heuristic pattern', () => {
    process.env.MY_SHORT_KEY = '123'; // Matches "KEY"
    _reloadSecrets();

    const spy = spyOn(console, 'info').mockImplementation(() => {});
    logger.info('The code is 123');
    
    // Currently fails because length 3 is skipped
    expect(spy).toHaveBeenCalledWith('The code is [REDACTED]');
    
    spy.mockRestore();
  });

  it('should NOT mask short variables that do not match the pattern', () => {
    process.env.MY_SAFE_VAR = 'abc';
    _reloadSecrets();

    const spy = spyOn(console, 'info').mockImplementation(() => {});
    logger.info('The value is abc');
    
    expect(spy).toHaveBeenCalledWith('The value is abc');
    
    spy.mockRestore();
  });

  it('should NOT mask long variables that do not match the pattern', () => {
    process.env.MY_LONG_VAR = 'abcdefg';
    _reloadSecrets();
    
    const spy = spyOn(console, 'info').mockImplementation(() => {});
    logger.info('The value is abcdefg');
    
    expect(spy).toHaveBeenCalledWith('The value is abcdefg');
    
    spy.mockRestore();
  });
});
