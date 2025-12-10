import { XMLParser } from 'fast-xml-parser';
import * as http from 'http';
import * as https from 'https';
import * as ntlm from './ntlm';
import { createLogger } from './logger';
import { SoapEnvelope, AuthMethod } from '../types';
import { parseUsername, createBasicAuth } from './auth';

type HttpModule = typeof http | typeof https;

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
  timeout?: number,
  useHttps?: boolean,
  rejectUnauthorized?: boolean
): Promise<T> {
  const httpModule: HttpModule = useHttps ? https : http;
  const options: http.RequestOptions | https.RequestOptions = {
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
    ...(useHttps && { rejectUnauthorized: rejectUnauthorized ?? true }),
  };

  logger.debug('Sending HTTP request (Basic)', { host, port, path, useHttps });

  return new Promise<T>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    const req = httpModule.request(options, (res) => {
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
 * Make HTTP request and return response with headers.
 * Used for NTLM handshake steps.
 */
function makeRequest(
  options: http.RequestOptions | https.RequestOptions,
  body: string,
  agent: http.Agent | https.Agent,
  httpModule: HttpModule
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = httpModule.request({ ...options, agent }, (res) => {
      res.setEncoding('utf8');
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Extract NTLM/Negotiate token from WWW-Authenticate header.
 */
function extractAuthToken(headers: http.IncomingHttpHeaders): string | null {
  const wwwAuth = headers['www-authenticate'];
  if (!wwwAuth) return null;

  // Handle array or string
  const authHeader = Array.isArray(wwwAuth) ? wwwAuth[0] : wwwAuth;

  // Match both "Negotiate <token>" and "NTLM <token>"
  const match = authHeader.match(/(?:Negotiate|NTLM)\s+([A-Za-z0-9+/=]+)/i);
  return match ? match[1] : null;
}

/**
 * Send HTTP request with NTLM authentication.
 * Implements the 3-step NTLM handshake:
 * 1. Send Type 1 (negotiate) message
 * 2. Receive Type 2 (challenge) message
 * 3. Send Type 3 (authenticate) message with response
 *
 * All requests must use the same TCP connection (keep-alive).
 */
async function sendHttpNtlm<T extends SoapEnvelope>(
  data: string,
  host: string,
  port: number,
  path: string,
  username: string,
  password: string,
  timeout?: number,
  useHttps?: boolean,
  rejectUnauthorized?: boolean
): Promise<T> {
  const parsed = parseUsername(username);
  const httpModule: HttpModule = useHttps ? https : http;

  logger.debug('Sending HTTP request (NTLM)', {
    host,
    port,
    path,
    domain: parsed.domain,
    username: parsed.user,
    useHttps,
  });

  // Keep-alive agent to maintain same TCP connection for NTLM handshake
  const agentOptions = {
    keepAlive: true,
    maxSockets: 1,
    ...(useHttps && { rejectUnauthorized: rejectUnauthorized ?? true }),
  };
  const agent = useHttps
    ? new https.Agent(agentOptions)
    : new http.Agent(agentOptions);

  const baseOptions: http.RequestOptions | https.RequestOptions = {
    host,
    port,
    path,
    method: 'POST',
    timeout,
    headers: {
      'Content-Type': 'application/soap+xml;charset=UTF-8',
      'User-Agent': 'NodeJS WinRM Client',
      Connection: 'keep-alive',
    },
    ...(useHttps && { rejectUnauthorized: rejectUnauthorized ?? true }),
  };

  try {
    // Step 0: Initial request without auth to get server's supported methods
    logger.debug('NTLM Step 0: Initial probe');

    const probeResponse = await makeRequest(
      {
        ...baseOptions,
        headers: {
          ...baseOptions.headers,
          'Content-Length': 0,
        },
      },
      '',
      agent,
      httpModule
    );

    logger.debug('NTLM Step 0 response', {
      statusCode: probeResponse.statusCode,
      wwwAuth: probeResponse.headers['www-authenticate'],
    });

    // Step 1: Generate and send Type 1 message
    // ntlm-client returns "NTLM <base64>", we need just the base64 part
    const type1Full = ntlm.createType1Message('', parsed.domain);
    const type1 = type1Full.replace(/^NTLM\s+/, '');

    logger.debug('NTLM Step 1: Sending Type 1 message', { type1 });

    const step1Response = await makeRequest(
      {
        ...baseOptions,
        headers: {
          ...baseOptions.headers,
          Authorization: `Negotiate ${type1}`,
          'Content-Length': 0,
        },
      },
      '',
      agent,
      httpModule
    );

    logger.debug('NTLM Step 1 response', {
      statusCode: step1Response.statusCode,
      wwwAuth: step1Response.headers['www-authenticate'],
    });

    // Step 2: Extract Type 2 challenge
    if (step1Response.statusCode !== 401) {
      if (step1Response.statusCode >= 200 && step1Response.statusCode < 300) {
        return parseXmlResponse<T>(step1Response.body);
      }
      throw new Error(
        `NTLM Step 1 failed: ${step1Response.statusCode} - expected 401 challenge`
      );
    }

    const type2Token = extractAuthToken(step1Response.headers);
    if (!type2Token) {
      const wwwAuth = step1Response.headers['www-authenticate'];
      throw new Error(
        `NTLM Step 2 failed: No challenge token. WWW-Authenticate: ${wwwAuth || '(not present)'}`
      );
    }

    logger.debug('NTLM Step 2: Received Type 2 challenge');

    // Step 3: Generate and send Type 3 message
    const type2Message = ntlm.decodeType2Message(type2Token);
    // ntlm-client returns "NTLM <base64>", we need just the base64 part
    const type3Full = ntlm.createType3Message(
      type2Message,
      parsed.user,
      password,
      '',
      parsed.domain
    );
    const type3 = type3Full.replace(/^NTLM\s+/, '');

    logger.debug('NTLM Step 3: Sending Type 3 authentication', { type3 });

    const step3Response = await makeRequest(
      {
        ...baseOptions,
        headers: {
          ...baseOptions.headers,
          Authorization: `Negotiate ${type3}`,
          'Content-Length': Buffer.byteLength(data),
        },
      },
      data,
      agent,
      httpModule
    );

    logger.debug('NTLM Step 3 response', {
      statusCode: step3Response.statusCode,
    });

    if (step3Response.statusCode < 200 || step3Response.statusCode >= 300) {
      throw new Error(
        `NTLM authentication failed: ${step3Response.statusCode} ${step3Response.body || '(no message)'}`
      );
    }

    return parseXmlResponse<T>(step3Response.body);
  } finally {
    agent.destroy();
  }
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
  timeout?: number,
  useHttps?: boolean,
  rejectUnauthorized?: boolean
): Promise<T> {
  if (authMethod === 'ntlm') {
    return sendHttpNtlm<T>(
      data,
      host,
      port,
      path,
      username,
      password,
      timeout,
      useHttps,
      rejectUnauthorized
    );
  }
  return sendHttpBasic<T>(
    data,
    host,
    port,
    path,
    username,
    password,
    timeout,
    useHttps,
    rejectUnauthorized
  );
}
