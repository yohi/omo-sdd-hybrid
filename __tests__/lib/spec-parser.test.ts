import { describe, test, expect } from 'bun:test';
import { extractRequirements, extractDesign } from '../../.opencode/lib/spec-parser';

describe('spec-parser', () => {
  describe('extractRequirements', () => {
    test('REQ-001形式のヘッダーから要件を抽出', () => {
      const content = `
## REQ-001: ユーザー認証

ユーザーはメールとパスワードでログインできる。

### 受入条件
- ログイン成功時にJWTトークンを返却
- 失敗時は401エラーを返却
`;
      const result = extractRequirements(content);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('REQ-001');
      expect(result[0].description).toContain('ユーザーはメールとパスワードでログインできる');
      expect(result[0].acceptanceCriteria).toHaveLength(2);
      expect(result[0].acceptanceCriteria[0]).toBe('ログイン成功時にJWTトークンを返却');
      expect(result[0].acceptanceCriteria[1]).toBe('失敗時は401エラーを返却');
    });

    test('番号形式のヘッダーから要件を抽出', () => {
      const content = `
## 1. ユーザー認証

ログイン機能を実装する。

## 2. ログアウト

ログアウト機能を実装する。
`;
      const result = extractRequirements(content);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
      expect(result[0].description).toContain('ログイン機能を実装する');
      expect(result[1].id).toBe('2');
    });

    test('複数のREQ形式要件を抽出', () => {
      const content = `
## REQ-001: 認証

認証機能

### 受入条件
- JWT使用

## REQ-002: 認可

認可機能

### 受入条件
- RBAC対応
- 権限チェック
`;
      const result = extractRequirements(content);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('REQ-001');
      expect(result[0].acceptanceCriteria).toHaveLength(1);
      expect(result[1].id).toBe('REQ-002');
      expect(result[1].acceptanceCriteria).toHaveLength(2);
    });

    test('Acceptance Criteria英語形式も認識', () => {
      const content = `
## REQ-001: Auth

User authentication

### Acceptance Criteria
- Return JWT on success
- Return 401 on failure
`;
      const result = extractRequirements(content);
      expect(result).toHaveLength(1);
      expect(result[0].acceptanceCriteria).toHaveLength(2);
    });

    test('空の入力に対して空配列を返す', () => {
      expect(extractRequirements('')).toEqual([]);
      expect(extractRequirements('   ')).toEqual([]);
    });

    test('要件ヘッダーがない場合は空配列を返す', () => {
      const content = `
# タイトル

これは要件形式ではないドキュメントです。
`;
      expect(extractRequirements(content)).toEqual([]);
    });

    test('アスタリスク形式の箇条書きも認識', () => {
      const content = `
## REQ-001: テスト

説明

### 受入条件
* 条件1
* 条件2
`;
      const result = extractRequirements(content);
      expect(result[0].acceptanceCriteria).toHaveLength(2);
      expect(result[0].acceptanceCriteria[0]).toBe('条件1');
    });
  });

  describe('extractDesign', () => {
    test('Impacted Filesセクションからパスを抽出', () => {
      const content = `
## Impacted Files

- \`src/auth/login.ts\`
- \`src/auth/logout.ts\`
- \`__tests__/auth/login.test.ts\`
`;
      const result = extractDesign(content);
      expect(result.impactedFiles).toContain('src/auth/login.ts');
      expect(result.impactedFiles).toContain('src/auth/logout.ts');
      expect(result.impactedFiles).toContain('__tests__/auth/login.test.ts');
      expect(result.impactedFiles).toHaveLength(3);
    });

    test('Componentsセクションから抽出', () => {
      const content = `
## Components

- AuthService
- TokenManager
- UserRepository
`;
      const result = extractDesign(content);
      expect(result.components).toContain('AuthService');
      expect(result.components).toContain('TokenManager');
      expect(result.components).toHaveLength(3);
    });

    test('Dependenciesセクションから抽出', () => {
      const content = `
## Dependencies

- \`jsonwebtoken\`
- \`bcrypt\`
`;
      const result = extractDesign(content);
      expect(result.dependencies).toContain('jsonwebtoken');
      expect(result.dependencies).toContain('bcrypt');
      expect(result.dependencies).toHaveLength(2);
    });

    test('全セクションを同時に抽出', () => {
      const content = `
# 設計ドキュメント

## Impacted Files

- \`src/auth/service.ts\`

## Components

- AuthService

## Dependencies

- \`jose\`
`;
      const result = extractDesign(content);
      expect(result.impactedFiles).toHaveLength(1);
      expect(result.components).toHaveLength(1);
      expect(result.dependencies).toHaveLength(1);
    });

    test('空の入力に対して空の結果を返す', () => {
      const result = extractDesign('');
      expect(result.impactedFiles).toEqual([]);
      expect(result.components).toEqual([]);
      expect(result.dependencies).toEqual([]);
    });

    test('該当セクションがない場合は空配列を返す', () => {
      const content = `
# 設計概要

このドキュメントには該当セクションがありません。

## 概要

概要の説明です。
`;
      const result = extractDesign(content);
      expect(result.impactedFiles).toEqual([]);
      expect(result.components).toEqual([]);
      expect(result.dependencies).toEqual([]);
    });

    test('重複するパスは除外', () => {
      const content = `
## Impacted Files

- \`src/auth/login.ts\`
- \`src/auth/login.ts\`
- \`src/auth/logout.ts\`
`;
      const result = extractDesign(content);
      expect(result.impactedFiles).toHaveLength(2);
    });

    test('大文字小文字の混在を許容', () => {
      const content = `
## IMPACTED FILES

- \`src/file.ts\`

## COMPONENTS

- Service
`;
      const result = extractDesign(content);
      expect(result.impactedFiles).toHaveLength(1);
      expect(result.components).toHaveLength(1);
    });
  });
});
