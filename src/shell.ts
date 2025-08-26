import { parse } from 'js2xmlparser';
import { getSoapHeaderRequest } from './base-request';
import { sendHttp } from './http';
import { WinRMParams, CreateShellResponse } from './types';

function constructCreateShellRequest(): string {
  const res = getSoapHeaderRequest({
    action: 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Create',
  });

  res['s:Header']['wsman:OptionSet'] = [];
  res['s:Header']['wsman:OptionSet'].push({
    'wsman:Option': [
      {
        '@': {
          Name: 'WINRS_NOPROFILE',
        },
        '#': 'FALSE',
      },
      {
        '@': {
          Name: 'WINRS_CODEPAGE',
        },
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
  return parse('s:Envelope', res);
}

function constructDeleteShellRequest(params: WinRMParams): string {
  const res = getSoapHeaderRequest({
    resource_uri: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd',
    action: 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Delete',
    shellId: params.shellId,
  });

  res['s:Body'] = {};
  return parse('s:Envelope', res);
}

export async function doCreateShell(params: WinRMParams): Promise<string> {
  const req = constructCreateShellRequest();

  const result: CreateShellResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.auth
  );

  if (result['s:Envelope']['s:Body'][0]['s:Fault']) {
    throw new Error(
      result['s:Envelope']['s:Body'][0]['s:Fault'][0]['s:Code'][0][
        's:Subcode'
      ][0]['s:Value'][0]
    );
  } else {
    const shellId =
      result['s:Envelope']['s:Body'][0]['rsp:Shell']![0]['rsp:ShellId'][0];
    return shellId;
  }
}

export async function doDeleteShell(params: WinRMParams): Promise<string> {
  const req = constructDeleteShellRequest(params);

  const result: CreateShellResponse = await sendHttp(
    req,
    params.host,
    params.port,
    params.path,
    params.auth
  );

  if (result['s:Envelope']['s:Body'][0]['s:Fault']) {
    throw new Error(
      result['s:Envelope']['s:Body'][0]['s:Fault'][0]['s:Code'][0][
        's:Subcode'
      ][0]['s:Value'][0]
    );
  } else {
    return 'success';
  }
}
