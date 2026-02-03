import picomatch from 'picomatch';

export function matchesScope(normalizedPath: string, allowedScopes: string[]): boolean {
  return allowedScopes.some(glob => 
    picomatch.isMatch(normalizedPath, glob, { dot: false, nocase: process.platform === 'win32' })
  );
}
