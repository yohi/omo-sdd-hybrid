import { describe, test, expect } from 'bun:test';
import { capitalize, slugify, truncate } from '../../src/utils/string-helpers';

describe('string-helpers', () => {
  describe('capitalize', () => {
    test('先頭を大文字化する', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    test('既に大文字の場合はそのまま', () => {
      expect(capitalize('Hello')).toBe('Hello');
    });

    test('空文字列はそのまま返す', () => {
      expect(capitalize('')).toBe('');
    });

    test('1文字の場合も動作する', () => {
      expect(capitalize('a')).toBe('A');
    });

    test('日本語の場合はそのまま（先頭は変化なし）', () => {
      expect(capitalize('こんにちは')).toBe('こんにちは');
    });
  });

  describe('slugify', () => {
    test('スペースをハイフンに変換', () => {
      expect(slugify('hello world')).toBe('hello-world');
    });

    test('大文字を小文字に変換', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    test('特殊文字を除去', () => {
      expect(slugify('hello! @world#')).toBe('hello-world');
    });

    test('連続するスペースを単一ハイフンに', () => {
      expect(slugify('hello   world')).toBe('hello-world');
    });

    test('先頭と末尾のスペースを除去', () => {
      expect(slugify('  hello world  ')).toBe('hello-world');
    });

    test('空文字列はそのまま返す', () => {
      expect(slugify('')).toBe('');
    });

    test('数字を含む文字列も処理できる', () => {
      expect(slugify('Task 123 Example')).toBe('task-123-example');
    });
  });

  describe('truncate', () => {
    test('最大長を超える場合は切り詰める', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    test('最大長以下の場合はそのまま', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    test('カスタム省略記号を使用できる', () => {
      expect(truncate('hello world', 8, '…')).toBe('hello w…');
    });

    test('空文字列はそのまま返す', () => {
      expect(truncate('', 10)).toBe('');
    });

    test('最大長と同じ長さの場合はそのまま', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });
  });
});
