import { parse } from 'js2xmlparser';
import { getSoapHeaderRequest } from './base-request';
import { sendHttp } from './http';
import { CommandParams, CommandResponse, ReceiveResponse } from './types';

function constructRunCommandRequest(params: CommandParams): string {
  const res = getSoapHeaderRequest({
    action: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command',
    shellId: params.shellId,
  });

  res['s:Header']['wsman:OptionSet'] = [];
  res['s:Header']['wsman:OptionSet'].push({
    'wsman:Option': [
      {
        '@': {
          Name: 'WINRS_CONSOLEMODE_STDIN',
        },
        '#': 'TRUE',
      },
      {
        '@': {
          Name: 'WINRS_SKIP_CMD_SHELL',
        },
        '#': 'FALSE',
      },
    ],
  });
  res['s:Body'] = {
    'rsp:CommandLine': {
      'rsp:Command': params.command,
    },
  };
  return parse('s:Envelope', res);
}

function constructReceiveOutputRequest(params: CommandParams): string {
  const res = getSoapHeaderRequest({
    action: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Receive',
    shellId: params.shellId,
  });

  res['s:Body'] = {
    'rsp:Receive': {
      'rsp:DesiredStream': {
        '@': {
          CommandId: params.commandId!,
        },
        '#': 'stdout stderr',
      },
    },
  };
  return parse('s:Envelope', res);
}

export async function doExecuteCommand(
  params: CommandParams
): Promise<string | Error> {
  const req = constructRunCommandRequest(params);

  const result: CommandResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.auth
  );

  if (result['s:Envelope']['s:Body'][0]['s:Fault']) {
    return new Error(
      result['s:Envelope']['s:Body'][0]['s:Fault'][0]['s:Code'][0][
        's:Subcode'
      ][0]['s:Value'][0]
    );
  } else {
    const commandId =
      result['s:Envelope']['s:Body'][0]['rsp:CommandResponse']![0][
        'rsp:CommandId'
      ][0];
    return commandId;
  }
}

function generatePowershellCommand(params: CommandParams): string {
  const args = [];
  args.unshift(
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-NoLogo',
    '-ExecutionPolicy',
    'Bypass',
    '-InputFormat',
    'Text',
    '-Command',
    '"& {',
    params.command,
    '}"'
  );
  return args.join(' ');
}

export async function doExecutePowershell(
  params: CommandParams
): Promise<string | Error> {
  params.command = generatePowershellCommand(params);
  return doExecuteCommand(params);
}

export async function doReceiveOutput(
  params: CommandParams
): Promise<string | Error> {
  const req = constructReceiveOutputRequest(params);

  const result: ReceiveResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.auth
  );

  if (result['s:Envelope']['s:Body'][0]['s:Fault']) {
    return new Error(
      result['s:Envelope']['s:Body'][0]['s:Fault'][0]['s:Code'][0][
        's:Subcode'
      ][0]['s:Value'][0]
    );
  } else {
    let successOutput = '';
    let failedOutput = '';
    if (
      result['s:Envelope']['s:Body'][0]['rsp:ReceiveResponse']![0]['rsp:Stream']
    ) {
      for (const stream of result['s:Envelope']['s:Body'][0][
        'rsp:ReceiveResponse'
      ]![0]['rsp:Stream']!) {
        if (
          stream['$'].Name === 'stdout' &&
          !stream['$'].hasOwnProperty('End')
        ) {
          successOutput += Buffer.from(stream['_'], 'base64').toString('ascii');
        }
        if (
          stream['$'].Name === 'stderr' &&
          !stream['$'].hasOwnProperty('End')
        ) {
          failedOutput += Buffer.from(stream['_'], 'base64').toString('ascii');
        }
      }
    }
    if (successOutput) {
      return successOutput.trim();
    }
    return failedOutput.trim();
  }
}
