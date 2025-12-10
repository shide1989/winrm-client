import { XMLBuilder } from 'fast-xml-parser';
import { getSoapHeaderRequest } from './base-request';
import { sendHttp } from './utils/http';
import { CreateShellResponse, WinRMParams } from './types';
import { checkForSoapFault, extractShellId } from './utils/xml-parser';
import { createLogger } from './utils/logger';

const logger = createLogger('shell');

function buildCreateShellRequest(): string {
  const res = getSoapHeaderRequest({
    action: 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Create',
  });

  // WINRS_NOPROFILE: FALSE = load user profile (needed for some PowerShell operations)
  // WINRS_CODEPAGE: 437 = US English, standard for Windows command output
  res['s:Header']['wsman:OptionSet'] = [];
  res['s:Header']['wsman:OptionSet'].push({
    'wsman:Option': [
      {
        '@Name': 'WINRS_NOPROFILE',
        '#': 'FALSE',
      },
      {
        '@Name': 'WINRS_CODEPAGE',
        '#': '437',
      },
    ],
  });
  res['s:Body'] = {
    'rsp:Shell': [
      {
        'rsp:InputStreams': 'stdin',
        'rsp:OutputStreams': 'stderr stdout',
      },
    ],
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

function buildDeleteShellRequest(params: WinRMParams): string {
  const res = getSoapHeaderRequest({
    resource_uri: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd',
    action: 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Delete',
    shellId: params.shellId,
  });

  res['s:Body'] = {};
  const builder = new XMLBuilder({
    attributeNamePrefix: '@',
    textNodeName: '#',
    ignoreAttributes: false,
    format: true,
    suppressBooleanAttributes: false,
  });
  return builder.build({ 's:Envelope': res });
}

export async function doCreateShell(params: WinRMParams): Promise<string> {
  logger.debug('Creating shell', {
    host: params.host,
    port: params.port,
    authMethod: params.authMethod,
  });

  const req = buildCreateShellRequest();
  const result: CreateShellResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.username,
    params.password,
    params.authMethod,
    undefined,
    params.useHttps,
    params.rejectUnauthorized
  );

  const shellId = extractShellId(result);
  logger.debug('Shell created successfully', { shellId });

  return shellId;
}

export async function doDeleteShell(params: WinRMParams): Promise<string> {
  logger.debug('Deleting shell', {
    shellId: params.shellId,
    host: params.host,
  });

  const req = buildDeleteShellRequest(params);
  const result: CreateShellResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.username,
    params.password,
    params.authMethod,
    undefined,
    params.useHttps,
    params.rejectUnauthorized
  );

  checkForSoapFault(result);
  logger.debug('Shell deleted successfully', { shellId: params.shellId });

  return 'success';
}
