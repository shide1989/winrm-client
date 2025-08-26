import { CreateShellResponse } from '../types';

// Dynamic XML value extractor
export function extractValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    return (current as Record<string, unknown>)?.[key];
  }, obj);
}

// Extract text content, handling both direct strings and _ property
export function extractText(obj: unknown): string {
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'object' && obj && '_' in obj)
    return (obj as { _: string })._;
  return String(obj || '');
}

// Get attribute value from $ object
export function extractAttribute(obj: unknown, attrName: string): string {
  if (typeof obj === 'object' && obj && '$' in obj) {
    const attrs = (obj as { $: Record<string, string> }).$;
    // Try different attribute name formats that fast-xml-parser might use
    return (
      attrs[attrName] || attrs[`@_${attrName}`] || attrs[`@${attrName}`] || ''
    );
  }
  return '';
}

// Check for SOAP fault in response
export function checkForSoapFault(response: unknown): void {
  const fault = extractValue(response, 's:Envelope.s:Body.s:Fault');
  if (fault) {
    const errorValue = extractValue(fault, 's:Code.s:Subcode.s:Value');
    throw new Error(String(errorValue || 'SOAP Fault occurred'));
  }
}

// Extract shell ID from various possible locations in response
export function extractShellId(response: CreateShellResponse): string {
  checkForSoapFault(response);

  // Try to get from ResourceCreated selector first (most reliable)
  const selectorValue = extractValue(
    response,
    's:Envelope.s:Body.x:ResourceCreated.a:ReferenceParameters.w:SelectorSet.w:Selector'
  );
  if (selectorValue) {
    return extractText(selectorValue);
  }

  // Fallback to rsp:Shell element
  const shellId = extractValue(
    response,
    's:Envelope.s:Body.rsp:Shell.rsp:ShellId'
  );
  if (shellId) {
    return extractText(shellId);
  }

  throw new Error('Unable to extract shell ID from response');
}

// Extract command ID from command response
export function extractCommandId(response: unknown): string {
  checkForSoapFault(response);

  const commandId = extractValue(
    response,
    's:Envelope.s:Body.rsp:CommandResponse.rsp:CommandId'
  );
  if (commandId) {
    return extractText(commandId);
  }

  throw new Error('Unable to extract command ID from response');
}

// Extract streams from receive response
export function extractStreams(
  response: unknown
): Array<{ name: string; content: string; end?: boolean }> {
  checkForSoapFault(response);

  const streams = extractValue(
    response,
    's:Envelope.s:Body.rsp:ReceiveResponse.rsp:Stream'
  );
  if (!streams) {
    return [];
  }

  // Handle both single stream and array of streams
  const streamArray = Array.isArray(streams) ? streams : [streams];

  return streamArray.map((stream) => ({
    name: extractAttribute(stream, 'Name') || '',
    content: extractText(stream) || '',
    end: extractAttribute(stream, 'End') === 'true',
  }));
}
