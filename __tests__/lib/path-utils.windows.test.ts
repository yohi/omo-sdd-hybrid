import { mock, expect, test, describe } from "bun:test";

// Only run these tests if we can safely mock 'path' without affecting other tests
// OR if we are actually on Windows.
// Since mock.module leaks in bun test context, we should skip mocking on non-Windows
// unless we are running this test in isolation.
// For now, to prevent garbage generation on Linux, we skip the mock definition.

const isWindows = process.platform === 'win32';

if (isWindows) {
  mock.module("path", () => {
    const win32 = require("node:path").win32;
    return {
      ...win32,
      default: win32,
    };
  });

  mock.module("fs", () => {
    const fs = require("node:fs");
    const mockedFs = {
      ...fs,
      realpathSync: (p: string) => p,
      lstatSync: (p: string) => ({
        isSymbolicLink: () => false,
      }),
    };
    return {
      ...mockedFs,
      default: mockedFs,
    };
  });
}

const { isOutsideWorktree } = require("../../.opencode/lib/path-utils");

describe("isOutsideWorktree (Windows behavior)", () => {
  if (!isWindows) {
    test("SKIP: Windows tests skipped on non-Windows platform to prevent global scope pollution", () => {
      console.warn("Skipping Windows path tests to avoid polluting global 'path' module");
    });
    return;
  }

  const worktreeRoot = "C:\\repo";

  test("should return false for files inside worktree", () => {
    expect(isOutsideWorktree("C:\\repo\\src\\file.ts", worktreeRoot)).toBe(false);
  });

  test("should return true for files outside worktree (different drive)", () => {
    expect(isOutsideWorktree("D:\\repo\\src\\file.ts", worktreeRoot)).toBe(true);
  });

  test("should return false for case mismatch in drive letter (KNOWN BUG)", () => {
    expect(isOutsideWorktree("c:\\repo\\src\\file.ts", worktreeRoot)).toBe(false);
  });

  test("should return false for case mismatch in path", () => {
    expect(isOutsideWorktree("C:\\REPO\\src\\file.ts", worktreeRoot)).toBe(false);
  });

  test("should return false for UNC paths with case mismatch", () => {
    const uncRoot = "\\\\server\\share";
    expect(isOutsideWorktree("\\\\SERVER\\SHARE\\file.ts", uncRoot)).toBe(false);
  });

  test("should return true for files truly outside", () => {
    expect(isOutsideWorktree("C:\\other\\file.ts", worktreeRoot)).toBe(true);
  });
});
