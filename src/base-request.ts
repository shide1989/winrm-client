import { v5 as uuidv5 } from 'uuid';
import { SoapHeaderParams, SoapHeader } from './types';

export function getSoapHeaderRequest(params: SoapHeaderParams): SoapHeader {
  if (!params.message_id) {
    params.message_id = uuidv5('nodejs-winrm', uuidv5.DNS);
  }

  const header: SoapHeader = {
    '@xmlns:s': 'http://www.w3.org/2003/05/soap-envelope',
    '@xmlns:wsa': 'http://schemas.xmlsoap.org/ws/2004/08/addressing',
    '@xmlns:wsman': 'http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd',
    '@xmlns:p': 'http://schemas.microsoft.com/wbem/wsman/1/wsman.xsd',
    '@xmlns:rsp': 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell',
    's:Header': {
      'wsa:To': 'http://windows-host:5985/wsman',
      'wsman:ResourceURI': {
        '@mustUnderstand': 'true',
        '#': 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd',
      },
      'wsa:ReplyTo': {
        'wsa:Address': {
          '@mustUnderstand': 'true',
          '#': 'http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous',
        },
      },
      'wsman:MaxEnvelopeSize': {
        '@mustUnderstand': 'true',
        '#': '153600',
      },
      'wsa:MessageID': 'uuid:' + params.message_id,
      'wsman:Locale': {
        '@mustUnderstand': 'false',
        '@xml:lang': 'en-US',
      },
      'wsman:OperationTimeout': 'PT60S',
      'wsa:Action': {
        '@mustUnderstand': 'true',
        '#': params.action,
      },
    },
  };

  if (params.shellId) {
    header['s:Header']['wsman:SelectorSet'] = [];
    header['s:Header']['wsman:SelectorSet'].push({
      'wsman:Selector': [
        {
          '@Name': 'ShellId',
          '#': params.shellId,
        },
      ],
    });
  }

  return header;
}
