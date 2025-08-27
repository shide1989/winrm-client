/**
 * Logger interface for debug output
 */
interface Logger {
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Check if debug logging is enabled for a namespace
 */
function isDebugEnabled(namespace: string): boolean {
  const debug = process.env.DEBUG;
  if (!debug) return false;

  return (
    debug === 'winrm' ||
    debug === '*' ||
    debug.includes(`winrm:${namespace}`) ||
    debug.includes('winrm:*')
  );
}

/**
 * Format arguments for logging output
 */
function formatArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: arg.message,
        stack: arg.stack,
        ...Object.getOwnPropertyNames(arg).reduce(
          (acc, key) => {
            if (key !== 'name' && key !== 'message' && key !== 'stack') {
              acc[key] = (arg as unknown as Record<string, unknown>)[key];
            }
            return acc;
          },
          {} as Record<string, unknown>
        ),
      };
    }
    return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg;
  });
}

/**
 * Create a namespaced logger instance
 * @param namespace - The namespace for this logger. Possible values are:
 * - 'http'
 * - 'shell'
 * - 'command'
 * - 'interactive'
 * - 'runCommand'
 * - 'runPowershell'
 * @returns Logger object.
 */
export function createLogger(namespace: string): Logger {
  const enabled = isDebugEnabled(namespace);

  return {
    debug(message: string, ...args: unknown[]): void {
      if (!enabled) return;
      console.debug(`[DEBUG:${namespace}] ${message}`, ...formatArgs(args));
    },
  };
}

export default { createLogger };
