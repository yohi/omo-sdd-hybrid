import { mock, expect, test, describe } from "bun:test";

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

const { isOutsideWorktree } = require("../../.opencode/lib/path-utils");

describe("isOutsideWorktree (Windows behavior)", () => {
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
