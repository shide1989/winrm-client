import * as Shell from './src/shell';
import * as Command from './src/command';
import { createLogger } from './src/utils/logger';

export { Shell, Command };

export async function runCommand(
  command: string,
  host: string,
  username: string,
  password: string,
  port: number,
  usePowershell = false
): Promise<string> {
  try {
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

    const shellId = await Shell.doCreateShell(params);
    logger.debug('shellId', shellId);
    const shellParams = { ...params, shellId };
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
    await Shell.doDeleteShell(shellParams);

    return output;
  } catch (error) {
    console.error('[runCommand] error', error);
    throw error;
  }
}

export async function runPowershell(
  command: string,
  host: string,
  username: string,
  password: string,
  port: number
): Promise<string> {
  return runCommand(command, host, username, password, port, true);
}
