import { describe, it, expect } from 'bun:test';
import { BashParser } from '../../.opencode/lib/bash-parser';

describe('BashParser', () => {
  it('should parse simple commands', () => {
    const nodes = BashParser.parse('ls -la /tmp');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('command');
    if (nodes[0].type === 'command') {
      expect(nodes[0].command).toBe('ls');
      expect(nodes[0].args).toEqual(['-la', '/tmp']);
    }
  });

  it('should handle multiple segments with semicolon', () => {
    const nodes = BashParser.parse('echo hello; ls /tmp');
    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe('command');
    expect(nodes[1].type).toBe('command');
  });

  it('should handle quoted arguments', () => {
    const nodes = BashParser.parse('rm -rf "/some path/with spaces"');
    expect(nodes).toHaveLength(1);
    if (nodes[0].type === 'command') {
      expect(nodes[0].args).toEqual(['-rf', '/some path/with spaces']);
    }
  });

  it('should handle nested quotes', () => {
    const nodes = BashParser.parse("echo '\"hello\"'");
    if (nodes[0].type === 'command') {
      expect(nodes[0].args).toEqual(['"hello"']);
    }
  });

  it('should detect complex constructs', () => {
    const nodes = BashParser.parse('echo $(ls)');
    expect(nodes[0].type).toBe('complex');
    expect((nodes[0] as any).reason).toBe('substitution_detected');
  });

  it('should handle escaped characters', () => {
    const nodes = BashParser.parse('echo hello\\ world');
    if (nodes[0].type === 'command') {
      expect(nodes[0].args).toEqual(['hello world']);
    }
  });

  it('should handle redirections', () => {
    const nodes = BashParser.parse('echo hello > out.txt');
    if (nodes[0].type === 'command') {
      expect(nodes[0].tokens).toEqual(['echo', 'hello', '>', 'out.txt']);
    }
  });
});
