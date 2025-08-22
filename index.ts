import * as Shell from './src/shell';
import * as Command from './src/command';

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

    const shellParams = { ...params, shellId };
    const commandParams = { ...shellParams, command };

    let commandId: string;
    if (usePowershell) {
      commandId = await Command.doExecutePowershell(commandParams);
    } else {
      commandId = await Command.doExecuteCommand(commandParams);
    }

    const receiveParams = { ...commandParams, commandId };
    const output = await Command.doReceiveOutput(receiveParams);

    await Shell.doDeleteShell(shellParams);

    return output;
  } catch (error) {
    console.log('error', error);
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
