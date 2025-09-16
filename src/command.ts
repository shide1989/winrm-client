import { XMLBuilder } from 'fast-xml-parser';
import { getSoapHeaderRequest } from './base-request';
import { sendHttp } from './utils/http';
import {
  CommandParams,
  CommandResponse,
  ReceiveResponse,
  SendInputParams,
  SendInputResponse,
  ReceiveOutputResult,
  StreamData,
} from './types';
import { createLogger } from './utils/logger';
import {
  extractCommandId,
  extractStreams,
  extractValue,
  extractSendResult,
} from './utils/xml-parser';

const logger = createLogger('command');

function buildRunCommandRequest(params: CommandParams): string {
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

function buildReceiveOutputRequest(params: CommandParams): string {
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

function buildSendInputRequest(params: SendInputParams): string {
  const res = getSoapHeaderRequest({
    action: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Send',
    shellId: params.shellId,
  });

  const base64Input = Buffer.from(params.input, 'utf8').toString('base64');

  res['s:Body'] = {
    'rsp:Send': {
      'rsp:Stream': {
        '@CommandId': params.commandId!,
        '@Name': 'stdin',
        '#': base64Input,
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
  const req = buildRunCommandRequest(params);

  const result: CommandResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.auth,
    params.httpTimeout
  );

  return extractCommandId(result);
}

export async function doSendInput(params: SendInputParams): Promise<void> {
  const req = buildSendInputRequest(params);

  const result: SendInputResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.auth,
    params.httpTimeout
  );

  extractSendResult(result);
}

function generatePowershellCommand(
  params: CommandParams,
  interactive = false
): string {
  const args = [];
  args.unshift('powershell.exe', '-NoProfile');

  if (!interactive) {
    args.push('-NonInteractive');
  }

  args.push(
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
  params: CommandParams,
  interactive = false
): Promise<string> {
  params.command = generatePowershellCommand(params, interactive);
  return doExecuteCommand(params);
}

export async function doReceiveOutput(params: CommandParams): Promise<string> {
  const req = buildReceiveOutputRequest(params);

  const result: ReceiveResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.auth,
    params.httpTimeout
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

export async function doReceiveOutputNonBlocking(
  params: CommandParams
): Promise<ReceiveOutputResult> {
  const req = buildReceiveOutputRequest(params);

  logger.debug('doReceiveOutputNonBlocking', {
    req,
    params,
  });
  const result: ReceiveResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.auth,
    params.httpTimeout
  );

  const streams = extractStreams(result);

  let output = '';
  let stderr = '';
  let isComplete = false;

  const streamData: StreamData[] = streams.map((stream) => ({
    name: stream.name,
    content: stream.content,
    end: stream.end,
  }));

  for (const stream of streams) {
    if (stream.name === 'stdout') {
      if (stream.end) {
        isComplete = true;
      } else if (stream.content) {
        output += Buffer.from(stream.content, 'base64').toString('ascii');
      }
    }
    if (stream.name === 'stderr') {
      if (stream.end) {
        isComplete = true;
      } else if (stream.content) {
        stderr += Buffer.from(stream.content, 'base64').toString('ascii');
      }
    }
  }

  return {
    output: output.trim(),
    stderr: stderr.trim(),
    isComplete,
    streams: streamData,
  };
}
