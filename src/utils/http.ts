import { XMLParser } from 'fast-xml-parser';
import * as http from 'http';
import httpntlm from 'httpntlm';
import { createLogger } from './logger';
import { SoapEnvelope, AuthMethod } from '../types';
import { parseUsername, createBasicAuth } from './auth';

const logger = createLogger('http');

/**
 * Parse XML response into typed object.
 */
function parseXmlResponse<T>(dataBuffer: string): T {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributesGroupName: '$',
    textNodeName: '_',
  });
  return parser.parse(dataBuffer);
}

/**
 * Send HTTP request with Basic authentication.
 */
function sendHttpBasic<T extends SoapEnvelope>(
  data: string,
  host: string,
  port: number,
  path: string,
  username: string,
  password: string,
  timeout?: number
): Promise<T> {
  const options: http.RequestOptions = {
    host,
    port,
    path,
    method: 'POST',
    headers: {
      Authorization: createBasicAuth(username, password),
      'Content-Type': 'application/soap+xml;charset=UTF-8',
      'User-Agent': 'NodeJS WinRM Client',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  logger.debug('Sending HTTP request (Basic)', { host, port, path });

  return new Promise<T>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    const req = http.request(options, (res) => {
      logger.debug('HTTP response received', {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
      });

      if (res.statusCode && (res.statusCode < 200 || res.statusCode > 299)) {
        reject(
          new Error(
            `Failed to process the request: ${res.statusCode} ${res.statusMessage || '(no message)'}`
          )
        );
        return;
      }

      res.setEncoding('utf8');
      let dataBuffer = '';
      res.on('data', (chunk) => {
        dataBuffer += chunk;
      });
      res.on('end', () => {
        if (timeoutId) clearTimeout(timeoutId);
        try {
          resolve(parseXmlResponse<T>(dataBuffer));
        } catch (err) {
          reject(new Error('Data Parsing error: ' + (err as Error).message));
        }
      });
    });

    req.on('error', (err) => {
      logger.debug('HTTP request error', err);
      reject(err);
    });

    req.write(data);
    req.end();

    if (timeout) {
      timeoutId = setTimeout(() => {
        logger.debug('Request timed out');
        req.destroy(new Error('Request timed out'));
      }, timeout);
    }
  });
}

/**
 * Send HTTP request with NTLM authentication.
 * NTLM requires a 3-way handshake (Type1 → Type2 challenge → Type3 response).
 * The httpntlm library handles this internally.
 */
function sendHttpNtlm<T extends SoapEnvelope>(
  data: string,
  host: string,
  port: number,
  path: string,
  username: string,
  password: string,
  timeout?: number
): Promise<T> {
  const parsed = parseUsername(username);
  const url = `http://${host}:${port}${path}`;

  logger.debug('Sending HTTP request (NTLM)', {
    host,
    port,
    path,
    domain: parsed.domain,
  });

  return new Promise<T>((resolve, reject) => {
    const options: httpntlm.Options = {
      url,
      username: parsed.user,
      password,
      domain: parsed.domain,
      workstation: '', // Optional - identifies client machine, not required for WinRM
      body: data,
      headers: {
        'Content-Type': 'application/soap+xml;charset=UTF-8',
        'User-Agent': 'NodeJS WinRM Client',
      },
    };

    if (timeout) options.timeout = timeout;

    httpntlm.post(options, (err, res) => {
      if (err) {
        logger.debug('NTLM HTTP request error', err);
        reject(err);
        return;
      }

      logger.debug('NTLM HTTP response received', {
        statusCode: res?.statusCode,
      });

      if (res?.statusCode && (res.statusCode < 200 || res.statusCode > 299)) {
        reject(
          new Error(
            `Failed to process the request: ${res.statusCode} ${res.statusMessage || '(no message)'}`
          )
        );
        return;
      }

      try {
        resolve(parseXmlResponse<T>(res?.body || ''));
      } catch (parseErr) {
        reject(new Error('Data Parsing error: ' + (parseErr as Error).message));
      }
    });
  });
}

/**
 * Send HTTP request with the specified authentication method.
 */
export function sendHttp<T extends SoapEnvelope>(
  data: string,
  host: string,
  port: number,
  path: string,
  username: string,
  password: string,
  authMethod: AuthMethod,
  timeout?: number
): Promise<T> {
  if (authMethod === 'ntlm') {
    return sendHttpNtlm<T>(data, host, port, path, username, password, timeout);
  }
  return sendHttpBasic<T>(data, host, port, path, username, password, timeout);
}
