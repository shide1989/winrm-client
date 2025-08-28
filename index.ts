import * as Shell from './src/shell';
import * as Command from './src/command';
import { createLogger } from './src/utils/logger';
import { executeInteractiveCommand } from './src/interactive';
import {
  CommandParams,
  InteractiveCommandParams,
  InteractivePrompt,
} from './src/types';

export { Shell, Command, executeInteractiveCommand };

/**
 * Execute a command on a remote Windows machine via WinRM
 * @param command - Command to execute
 * @param host - Target host address
 * @param username - Username for authentication
 * @param password - Password for authentication
 * @param port - WinRM port (typically 5985 for HTTP)
 * @param usePowershell - Whether to use PowerShell (default: false)
 * @returns Command output
 */
export async function runCommand(
  command: string,
  host: string,
  username: string,
  password: string,
  port: number,
  usePowershell = false
): Promise<string> {
  const logger = createLogger('runCommand');

  const auth =
    'Basic ' +
    Buffer.from(username + ':' + password, 'utf8').toString('base64');
  const params = {
    host,
    port,
    path: '/wsman',
    auth: auth,
  };

  let shellParams: CommandParams | null = null;
  try {
    const shellId = await Shell.doCreateShell(params);
    logger.debug('shellId', shellId);
    shellParams = { ...params, shellId };
    const commandParams = { ...shellParams, command };

    let commandId: string;
    if (usePowershell) {
      commandId = await Command.doExecutePowershell(commandParams);
    } else {
      commandId = await Command.doExecuteCommand(commandParams);
    }

    logger.debug('commandId', commandId);
    const receiveParams = { ...commandParams, commandId };
    const output = await Command.doReceiveOutput(receiveParams);

    logger.debug('output', output);

    return output;
  } finally {
    if (shellParams) {
      await Shell.doDeleteShell(shellParams);
    }
  }
}

/**
 * Execute a PowerShell command on a remote Windows machine via WinRM
 * @param command - PowerShell command to execute
 * @param host - Target host address
 * @param username - Username for authentication
 * @param password - Password for authentication
 * @param port - WinRM port (typically 5985 for HTTP)
 * @returns Command output
 */
export async function runPowershell(
  command: string,
  host: string,
  username: string,
  password: string,
  port: number
): Promise<string> {
  return runCommand(command, host, username, password, port, true);
}

/**
 * Execute an interactive command that responds to prompts via WinRM
 * @param command - Command to execute
 * @param host - Target host address
 * @param username - Username for authentication
 * @param password - Password for authentication
 * @param port - WinRM port (typically 5985 for HTTP)
 * @param prompts - Array of prompt patterns and responses
 * @param executionTimeout - Overall command timeout in ms (default: 60000)
 * @param httpTimeout - HTTP request timeout in ms
 * @param pollInterval - Output polling interval in ms (default: 500)
 * @returns Command output
 */
export async function runInteractiveCommand(
  command: string,
  host: string,
  username: string,
  password: string,
  port: number,
  prompts: InteractivePrompt[],
  executionTimeout?: number,
  httpTimeout?: number,
  pollInterval?: number
): Promise<string> {
  const logger = createLogger('runInteractiveCommand');
  let shellParams: CommandParams | null = null;
  try {
    const auth =
      'Basic ' +
      Buffer.from(username + ':' + password, 'utf8').toString('base64');
    const params = {
      host,
      port,
      path: '/wsman',
      auth: auth,
    };

    const shellId = await Shell.doCreateShell(params);
    logger.debug('shellId', shellId);
    shellParams = { ...params, shellId };
    const commandParams: CommandParams = {
      ...shellParams,
      command,
      httpTimeout,
    };

    const commandId = await Command.doExecuteCommand(commandParams);
    logger.debug('commandId', commandId);

    const interactiveParams: InteractiveCommandParams = {
      ...commandParams,
      commandId,
      prompts,
      executionTimeout,
      pollInterval,
    };

    const output = await executeInteractiveCommand(interactiveParams);
    logger.debug('output', output);

    return output;
  } finally {
    if (shellParams) {
      await Shell.doDeleteShell(shellParams);
    }
  }
}

/**
 * Execute an interactive PowerShell command that responds to prompts via WinRM
 * @param command - PowerShell command to execute
 * @param host - Target host address
 * @param username - Username for authentication
 * @param password - Password for authentication
 * @param port - WinRM port (typically 5985 for HTTP)
 * @param prompts - Array of prompt patterns and responses
 * @param executionTimeout - Overall command timeout in ms (default: 60000)
 * @param httpTimeout - HTTP request timeout in ms
 * @param pollInterval - Output polling interval in ms (default: 500)
 * @returns Command output
 */
export async function runInteractivePowershell(
  command: string,
  host: string,
  username: string,
  password: string,
  port: number,
  prompts: InteractivePrompt[],
  executionTimeout?: number,
  httpTimeout?: number,
  pollInterval?: number
): Promise<string> {
  let shellParams: CommandParams | null = null;
  try {
    const logger = createLogger('runInteractivePowershell');

    const auth =
      'Basic ' +
      Buffer.from(username + ':' + password, 'utf8').toString('base64');
    const params = {
      host,
      port,
      path: '/wsman',
      auth: auth,
    };

    const shellId = await Shell.doCreateShell(params);
    logger.debug('shellId', shellId);
    shellParams = { ...params, shellId };
    const commandParams: CommandParams = {
      ...shellParams,
      command,
      httpTimeout,
    };

    const commandId = await Command.doExecutePowershell(commandParams, true);
    logger.debug('commandId', commandId);

    const interactiveParams: InteractiveCommandParams = {
      ...commandParams,
      commandId,
      prompts,
      executionTimeout,
      pollInterval,
    };

    const output = await executeInteractiveCommand(interactiveParams);
    logger.debug('output', output);

    return output;
  } finally {
    if (shellParams) {
      await Shell.doDeleteShell(shellParams);
    }
  }
}
