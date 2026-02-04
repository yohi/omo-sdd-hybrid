import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from 'fs';
import * as path from 'path';
import sddGenerateTests from '../../.opencode/tools/sdd_generate_tests';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

describe('sdd_generate_tests (Framework Detection)', () => {
  let tmpDir: string;
  let outputDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = setupTestState();
    outputDir = path.join(tmpDir, 'tests_output');
    process.env.SDD_TESTS_OUTPUT_DIR = outputDir;
    originalCwd = process.cwd();
    // process.cwd() を tmpDir に向けるために chdir する (ツール内で path.resolve(process.cwd(), 'package.json') しているため)
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTestState();
    delete process.env.SDD_TESTS_OUTPUT_DIR;
  });

  test('vitest がインストールされている場合は vitest をインポートする', async () => {
    const feature = 'vitest-app';
    const specDir = path.join(process.env.SDD_KIRO_DIR!, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'requirements.md'), '## 受入条件\n- Vitest test');

    // package.json を作成
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      devDependencies: {
        "vitest": "^1.0.0"
      }
    }));

    await sddGenerateTests.execute({ feature }, {});

    const content = fs.readFileSync(path.join(outputDir, `${feature}.acceptance.test.ts`), 'utf-8');
    expect(content).toContain('import { describe, test } from "vitest";');
  });

  test('jest がインストールされている場合は jest をインポートする', async () => {
    const feature = 'jest-app';
    const specDir = path.join(process.env.SDD_KIRO_DIR!, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'requirements.md'), '## 受入条件\n- Jest test');

    // package.json を作成
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: {
        "jest": "^29.0.0"
      }
    }));

    await sddGenerateTests.execute({ feature }, {});

    const content = fs.readFileSync(path.join(outputDir, `${feature}.acceptance.test.ts`), 'utf-8');
    expect(content).toContain('import { describe, test } from "jest";');
  });

  test('何も指定がない場合は bun:test を使用する', async () => {
    const feature = 'default-app';
    const specDir = path.join(process.env.SDD_KIRO_DIR!, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'requirements.md'), '## 受入条件\n- Default test');

    // package.json なし、またはテストフレームワークなし

    await sddGenerateTests.execute({ feature }, {});

    const content = fs.readFileSync(path.join(outputDir, `${feature}.acceptance.test.ts`), 'utf-8');
    expect(content).toContain('import { describe, test } from "bun:test";');
  });
});
