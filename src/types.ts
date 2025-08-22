export interface WinRMParams {
  host: string;
  port: number;
  path: string;
  auth: string;
  message_id?: string;
  action?: string;
  shellId?: string;
}

export interface CommandParams extends WinRMParams {
  command: string;
  commandId?: string;
}

export interface SoapHeaderParams {
  message_id?: string;
  action: string;
  resource_uri?: string;
  shellId?: string;
}

export interface SoapOption {
  '@': {
    Name: string;
  };
  '#': string;
}

export interface SoapSelector {
  'wsman:Selector': Array<{
    '@': {
      Name: string;
    };
    '#': string;
  }>;
}

export interface SoapHeader {
  '@': {
    'xmlns:s': string;
    'xmlns:wsa': string;
    'xmlns:wsman': string;
    'xmlns:p': string;
    'xmlns:rsp': string;
  };
  's:Header': {
    'wsa:To': string;
    'wsman:ResourceURI': {
      '@': {
        mustUnderstand: string;
      };
      '#': string;
    };
    'wsa:ReplyTo': {
      'wsa:Address': {
        '@': {
          mustUnderstand: string;
        };
        '#': string;
      };
    };
    'wsman:MaxEnvelopeSize': {
      '@': {
        mustUnderstand: string;
      };
      '#': string;
    };
    'wsa:MessageID': string;
    'wsman:Locale': {
      '@': {
        mustUnderstand: string;
        'xml:lang': string;
      };
    };
    'wsman:OperationTimeout': string;
    'wsa:Action': {
      '@': {
        mustUnderstand: string;
      };
      '#': string;
    };
    'wsman:OptionSet'?: Array<{
      'wsman:Option': SoapOption[];
    }>;
    'wsman:SelectorSet'?: SoapSelector[];
  };
  's:Body'?: any; // Flexible body content for different request types
}

export interface CreateShellResponse {
  's:Envelope': {
    's:Body': Array<{
      's:Fault'?: Array<{
        's:Code': Array<{
          's:Subcode': Array<{
            's:Value': string[];
          }>;
        }>;
      }>;
      'rsp:Shell'?: Array<{
        'rsp:ShellId': string[];
      }>;
    }>;
  };
}

export interface CommandResponse {
  's:Envelope': {
    's:Body': Array<{
      's:Fault'?: Array<{
        's:Code': Array<{
          's:Subcode': Array<{
            's:Value': string[];
          }>;
        }>;
      }>;
      'rsp:CommandResponse'?: Array<{
        'rsp:CommandId': string[];
      }>;
    }>;
  };
}

export interface ReceiveResponse {
  's:Envelope': {
    's:Body': Array<{
      's:Fault'?: Array<{
        's:Code': Array<{
          's:Subcode': Array<{
            's:Value': string[];
          }>;
        }>;
      }>;
      'rsp:ReceiveResponse'?: Array<{
        'rsp:Stream'?: Array<{
          $: {
            Name: string;
            End?: string;
          };
          _: string;
        }>;
      }>;
    }>;
  };
}
