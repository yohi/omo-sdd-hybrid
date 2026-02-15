
const IGNORED_KEYS = new Set([
  'NODE_ENV',
  'TERM',
  'SHELL',
  'USER',
  'PATH',
  'PWD',
  'HOME',
  'EDITOR',
  'LANG',
  'TZ',
  'SHLVL',
  '_'
]);

let secrets: string[] = [];

function loadSecrets() {
  const newSecrets = new Set<string>();
  const explicitTargets = ['NODE_AUTH_TOKEN', 'SDD_EMBEDDINGS_API_KEY'];
  const heuristicPattern = /TOKEN|KEY|SECRET|PASSWORD/i;

  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    
    if (IGNORED_KEYS.has(key)) continue;

    if (explicitTargets.includes(key) || heuristicPattern.test(key)) {
      newSecrets.add(value);
    }
  }
  
  // 部分一致による置換漏れを防ぐため、長い順にソートする
  secrets = Array.from(newSecrets).sort((a, b) => b.length - a.length);
}

loadSecrets();

/**
 * テスト用に秘密情報を再読み込みするための関数
 */
export const _reloadSecrets = () => {
  loadSecrets();
};

function maskString(str: string): string {
  let result = str;
  for (const secret of secrets) {
    if (result.includes(secret)) {
      result = result.replaceAll(secret, '[REDACTED]');
    }
  }
  return result;
}

const MAX_RECURSION_DEPTH = 10;

function maskValue(value: any, seen = new WeakSet<object>(), depth = 0): any {
  if (depth > MAX_RECURSION_DEPTH) {
    return '[Max Depth Exceeded]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return maskString(value);
  }
  
  if (value instanceof Error) {
    try {
      const maskedError = new Error(maskString(value.message));
      maskedError.stack = value.stack ? maskString(value.stack) : undefined;
      return maskedError;
    } catch (e) {
      return '[Error Masking Failed]';
    }
  }

  // Handle primitives that are not objects
  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(v => maskValue(v, seen, depth + 1));
  }

  // Plain object
  const maskedObj: any = {};
  try {
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        maskedObj[key] = maskValue(value[key], seen, depth + 1);
      }
    }
  } catch (e) {
    return '[Object Masking Failed]';
  }
  return maskedObj;
}

const logger = {
  info: (message: any, ...args: any[]) => {
    console.info(maskValue(message), ...args.map(v => maskValue(v)));
  },
  
  warn: (message: any, ...args: any[]) => {
    console.warn(maskValue(message), ...args.map(v => maskValue(v)));
  },
  
  error: (message: any, ...args: any[]) => {
    console.error(maskValue(message), ...args.map(v => maskValue(v)));
  },
  
  debug: (message: any, ...args: any[]) => {
    if (process.env.SDD_DEBUG === 'true') {
      console.debug(maskValue(message), ...args.map(v => maskValue(v)));
    }
  }
};

export { logger };
