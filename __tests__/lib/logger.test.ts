
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';

describe('Logger Utility', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleInfoSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;
  let consoleDebugSpy: any;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    mock.restore();
  });

  it('masks specific tokens defined in requirements', async () => {
    process.env.NODE_AUTH_TOKEN = 'secret-token-123';
    process.env.SDD_EMBEDDINGS_API_KEY = 'sk-secret-key-456';
    
    const { logger, _reloadSecrets } = await import('../../.opencode/lib/logger');
    if (_reloadSecrets) _reloadSecrets();

    logger.info('Token is secret-token-123');
    expect(consoleInfoSpy).toHaveBeenCalledWith('Token is [REDACTED]');

    logger.info('Key is sk-secret-key-456');
    expect(consoleInfoSpy).toHaveBeenCalledWith('Key is [REDACTED]');
  });

  it('masks heuristic matches (KEY, SECRET, PASSWORD, TOKEN)', async () => {
    process.env.MY_SUPER_SECRET = 'hidden-value-999';
    process.env.API_PASSWORD = 'password123';
    
    const { logger, _reloadSecrets } = await import('../../.opencode/lib/logger');
    if (_reloadSecrets) _reloadSecrets();

    logger.info('Secret is hidden-value-999 and password123');
    const lastCall = consoleInfoSpy.mock.lastCall;
    const output = lastCall[0];
    expect(output).toContain('Secret is [REDACTED]');
    expect(output).not.toContain('hidden-value-999');
    expect(output).not.toContain('password123');
  });

  it('ignores common non-secret env vars', async () => {
    process.env.USER = 'y_ohi';
    process.env.NODE_ENV = 'test';
    
    const { logger, _reloadSecrets } = await import('../../.opencode/lib/logger');
    if (_reloadSecrets) _reloadSecrets();

    logger.info('User is y_ohi in test env');
    expect(consoleInfoSpy).toHaveBeenCalledWith('User is y_ohi in test env');
  });

  it('ignores short values (< 4 chars)', async () => {
    process.env.SHORT_SECRET = '123';
    
    const { logger, _reloadSecrets } = await import('../../.opencode/lib/logger');
    if (_reloadSecrets) _reloadSecrets();

    logger.info('Short secret is 123');
    expect(consoleInfoSpy).toHaveBeenCalledWith('Short secret is 123');
  });

  it('recursively masks objects', async () => {
    process.env.DB_PASSWORD = 'db-password-secure';
    const { logger, _reloadSecrets } = await import('../../.opencode/lib/logger');
    if (_reloadSecrets) _reloadSecrets();

    const sensitiveObj = {
      user: 'admin',
      config: {
        pass: 'db-password-secure',
        details: {
          info: 'Uses db-password-secure for connection'
        }
      }
    };

    logger.info('Config:', sensitiveObj);
    
    const [msg, obj] = consoleInfoSpy.mock.lastCall;
    expect(msg).toBe('Config:');
    expect(obj.config.pass).toBe('[REDACTED]');
    expect(obj.config.details.info).toBe('Uses [REDACTED] for connection');
  });

  it('masks Error objects', async () => {
    process.env.API_KEY = 'deadbeef';
    const { logger, _reloadSecrets } = await import('../../.opencode/lib/logger');
    if (_reloadSecrets) _reloadSecrets();

    const error = new Error('Failed with API_KEY=deadbeef');
    error.stack = 'Error: Failed with API_KEY=deadbeef\n    at func (file.ts:1)';

    logger.error(error);

    const [loggedError] = consoleErrorSpy.mock.lastCall;
    expect(loggedError.message).toBe('Failed with API_KEY=[REDACTED]');
    expect(loggedError.stack).toContain('API_KEY=[REDACTED]');
  });

  it('handles debug mode correctly', async () => {
    process.env.SDD_DEBUG = '';
    
    const { logger, _reloadSecrets } = await import('../../.opencode/lib/logger');
    if (_reloadSecrets) _reloadSecrets();

    logger.debug('This should not verify');
    expect(consoleDebugSpy).not.toHaveBeenCalled();

    process.env.SDD_DEBUG = 'true';
    if (_reloadSecrets) _reloadSecrets();
    
    logger.debug('This should appear');
    expect(consoleDebugSpy).toHaveBeenCalledWith('This should appear');
    
    process.env.SECRET_TOKEN = 'xyz123';
    if (_reloadSecrets) _reloadSecrets();
    logger.debug('Debug secret xyz123');
    expect(consoleDebugSpy).toHaveBeenCalledWith('Debug secret [REDACTED]');
  });
});
