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
  command?: string;
  commandId?: string;
  httpTimeout?: number;
}

export interface SoapHeaderParams {
  message_id?: string;
  action: string;
  resource_uri?: string;
  shellId?: string;
}

export interface SoapOption {
  '@Name': string;
  '#': string;
}

export interface SoapSelector {
  'wsman:Selector': Array<{
    '@Name': string;
    '#': string;
  }>;
}

export interface SoapHeader {
  '@xmlns:s': string;
  '@xmlns:wsa': string;
  '@xmlns:wsman': string;
  '@xmlns:p': string;
  '@xmlns:rsp': string;
  's:Header': {
    'wsa:To': string;
    'wsman:ResourceURI': {
      '@mustUnderstand': string;
      '#': string;
    };
    'wsa:ReplyTo': {
      'wsa:Address': {
        '@mustUnderstand': string;
        '#': string;
      };
    };
    'wsman:MaxEnvelopeSize': {
      '@mustUnderstand': string;
      '#': string;
    };
    'wsa:MessageID': string;
    'wsman:Locale': {
      '@mustUnderstand': string;
      '@xml:lang': string;
    };
    'wsman:OperationTimeout': string;
    'wsa:Action': {
      '@mustUnderstand': string;
      '#': string;
    };
    'wsman:OptionSet'?: Array<{
      'wsman:Option': SoapOption[];
    }>;
    'wsman:SelectorSet'?: SoapSelector[];
  };
  's:Body'?: unknown; // Flexible body content for different request types
}

// Base interfaces for common SOAP response structures
export interface SoapFault {
  's:Code': Array<{
    's:Subcode': Array<{
      's:Value': string[];
    }>;
  }>;
}

export interface SoapEnvelope<T = unknown> {
  's:Envelope': {
    's:Body': Array<
      {
        's:Fault'?: Array<SoapFault>;
      } & T
    >;
  };
}

export interface CreateShellResponseBody {
  'x:ResourceCreated'?: {
    'a:Address': string;
    'a:ReferenceParameters': {
      'w:ResourceURI': string;
      'w:SelectorSet': {
        'w:Selector': {
          _: string;
          $: {
            '@_Name': string;
          };
        };
      };
    };
  };
  'rsp:Shell'?: {
    'rsp:ShellId': string;
    'rsp:ResourceUri': string;
    'rsp:Owner': string;
    'rsp:ClientIP': string;
    'rsp:IdleTimeOut': string;
    'rsp:InputStreams': string;
    'rsp:OutputStreams': string;
    'rsp:ShellRunTime': string;
    'rsp:ShellInactivity': string;
    $: {
      '@_xmlns:rsp': string;
    };
  };
}

export interface CreateShellResponse
  extends SoapEnvelope<CreateShellResponseBody> {}

// Specific response body types
export interface CommandResponseBody {
  'rsp:CommandResponse'?: Array<{
    'rsp:CommandId': string[];
  }>;
}

export interface ReceiveResponseBody {
  'rsp:ReceiveResponse'?: Array<{
    'rsp:Stream'?: Array<{
      $: {
        Name: string;
        End?: string;
      };
      _: string;
    }>;
  }>;
}

export interface SendInputResponseBody {
  'rsp:SendResponse'?: Array<unknown>;
}

// Factorized response interfaces
export interface CommandResponse extends SoapEnvelope<CommandResponseBody> {}

export interface ReceiveResponse extends SoapEnvelope<ReceiveResponseBody> {}

export interface SendInputParams extends CommandParams {
  input: string;
}

export interface SendInputResponse
  extends SoapEnvelope<SendInputResponseBody> {}

export interface StreamData {
  name: string;
  content: string;
  end?: boolean;
}

export interface ReceiveOutputResult {
  output: string;
  stderr: string;
  isComplete: boolean;
  streams: StreamData[];
}

/**
 *
 * @field pattern (optional) The pattern to detect
 * @field response The response to send to the STDIN when the pattern is detected
 * @field isSecure (optional) If true, the response will be treated as sensitive information and not logged
 * @field detector (optional) A custom synchronous function to detect the prompt in the output
 * @field asyncDetector (optional) A custom asynchronous function to detect the prompt in the output and return the response to send to the STDIN when the prompt is detected.
 *
 * Note: Either 'pattern' or 'detector'/'asyncDetector' must be provided.
 */
export interface InteractivePromptOutput {
  pattern?: RegExp;
  response?: string;
  isSecure?: boolean;
  detector?: (output: string) => boolean;
  asyncDetector?: (output: string) => Promise<string>;
}

export interface InteractiveCommandParams extends CommandParams {
  prompts: InteractivePromptOutput[];
  executionTimeout?: number;
  pollInterval?: number;
}
