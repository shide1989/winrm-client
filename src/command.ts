import { XMLBuilder } from 'fast-xml-parser';
import { getSoapHeaderRequest } from './base-request';
import { sendHttp } from './utils/http';
import { CommandParams, CommandResponse, ReceiveResponse } from './types';
import { createLogger } from './utils/logger';
import {
  extractCommandId,
  extractStreams,
  extractValue,
} from './utils/xml-parser';

const logger = createLogger('command');

function constructRunCommandRequest(params: CommandParams): string {
  const res = getSoapHeaderRequest({
    action: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command',
    shellId: params.shellId,
  });

  res['s:Header']['wsman:OptionSet'] = [];
  res['s:Header']['wsman:OptionSet'].push({
    'wsman:Option': [
      {
        '@Name': 'WINRS_CONSOLEMODE_STDIN',
        '#': 'TRUE',
      },
      {
        '@Name': 'WINRS_SKIP_CMD_SHELL',
        '#': 'FALSE',
      },
    ],
  });
  res['s:Body'] = {
    'rsp:CommandLine': {
      'rsp:Command': params.command,
    },
  };

  const builder = new XMLBuilder({
    attributeNamePrefix: '@',
    textNodeName: '#',
    ignoreAttributes: false,
    format: true,
    suppressBooleanAttributes: false,
  });
  return builder.build({ 's:Envelope': res });
}

function constructReceiveOutputRequest(params: CommandParams): string {
  const res = getSoapHeaderRequest({
    action: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Receive',
    shellId: params.shellId,
  });

  res['s:Body'] = {
    'rsp:Receive': {
      'rsp:DesiredStream': {
        '@CommandId': params.commandId!,
        '#': 'stdout stderr',
      },
    },
  };

  const builder = new XMLBuilder({
    attributeNamePrefix: '@',
    textNodeName: '#',
    ignoreAttributes: false,
    format: true,
    suppressBooleanAttributes: false,
  });
  return builder.build({ 's:Envelope': res });
}

export async function doExecuteCommand(params: CommandParams): Promise<string> {
  const req = constructRunCommandRequest(params);

  const result: CommandResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.auth
  );

  return extractCommandId(result);
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
): Promise<string> {
  params.command = generatePowershellCommand(params);
  return doExecuteCommand(params);
}

export async function doReceiveOutput(params: CommandParams): Promise<string> {
  const req = constructReceiveOutputRequest(params);

  const result: ReceiveResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.auth
  );

  const streams = extractStreams(result);

  let successOutput = '';
  let failedOutput = '';

  const rawStreams = extractValue(
    result,
    's:Envelope.s:Body.rsp:ReceiveResponse.rsp:Stream'
  );

  if (Array.isArray(rawStreams)) {
    rawStreams.forEach((stream, index) => {
      logger.debug(`stream ${index}`, {
        fullStream: JSON.stringify(stream, null, 2),
        dollarSign: stream?.$,
        attributes: Object.keys(stream?.$ || {}),
      });
    });
  }

  for (const stream of streams) {
    if (stream.name === 'stdout' && !stream.end) {
      successOutput += Buffer.from(stream.content, 'base64').toString('ascii');
    }
    if (stream.name === 'stderr' && !stream.end) {
      failedOutput += Buffer.from(stream.content, 'base64').toString('ascii');
    }
  }

  logger.debug('outputs', { successOutput, failedOutput });

  if (successOutput) {
    return successOutput.trim();
  }
  return failedOutput.trim();
}
