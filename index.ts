import * as shell from './src/shell';
import * as command from './src/command';

export { shell, command };

export async function runCommand(
  _command: string,
  _host: string,
  _username: string,
  _password: string,
  _port: number,
  _usePowershell = false
): Promise<string | Error> {
  try {
    const auth =
      'Basic ' +
      Buffer.from(_username + ':' + _password, 'utf8').toString('base64');
    const params = {
      host: _host,
      port: _port,
      path: '/wsman',
      auth: auth,
    };

    const shellId = await shell.doCreateShell(params);
    if (shellId instanceof Error) {
      return shellId;
    }

    const shellParams = { ...params, shellId };
    const commandParams = { ...shellParams, command: _command };

    let commandId: string | Error;
    if (_usePowershell) {
      commandId = await command.doExecutePowershell(commandParams);
    } else {
      commandId = await command.doExecuteCommand(commandParams);
    }

    if (commandId instanceof Error) {
      return commandId;
    }

    const receiveParams = { ...commandParams, commandId };
    const output = await command.doReceiveOutput(receiveParams);

    await shell.doDeleteShell(shellParams);

    return output;
  } catch (error) {
    console.log('error', error);
    return error instanceof Error ? error : new Error(String(error));
  }
}

export async function runPowershell(
  _command: string,
  _host: string,
  _username: string,
  _password: string,
  _port: number
): Promise<string | Error> {
  return runCommand(_command, _host, _username, _password, _port, true);
}
