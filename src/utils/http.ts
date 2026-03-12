import { XMLParser } from 'fast-xml-parser';
import * as http from 'http';
import * as https from 'https';
import * as ntlm from './ntlm';
import { createLogger } from './logger';
import { SoapEnvelope, AuthMethod } from '../types';
import { parseUsername, createBasicAuth } from './auth';

type HttpModule = typeof http | typeof https;

const logger = createLogger('http');

// ── SPNEGO unwrapping ───────────────────────────────────────────────

/** Unwrap SPNEGO NegTokenResp to extract raw NTLM token. */
export function spnegoUnwrap(token: Buffer): Buffer {
  if (token.length >= 7 && token.toString('ascii', 0, 7) === 'NTLMSSP') {
    return token;
  }
  let pos = 0;
  function readTag(): { tag: number; len: number; start: number } | null {
    if (pos >= token.length) return null;
    const tag = token[pos++];
    let len = token[pos++];
    if (len & 0x80) {
      const numBytes = len & 0x7f;
      len = 0;
      for (let i = 0; i < numBytes; i++) {
        len = (len << 8) | token[pos++];
      }
    }
    return { tag, len, start: pos };
  }
  const outer = readTag();
  if (!outer) return token;
  const seq = readTag();
  if (!seq || seq.tag !== 0x30) return token;
  const seqEnd = seq.start + seq.len;
  while (pos < seqEnd) {
    const elem = readTag();
    if (!elem) break;
    if (elem.tag === 0xa2) {
      const inner = readTag();
      if (inner && inner.tag === 0x04) {
        return token.subarray(inner.start, inner.start + inner.len);
      }
    }
    pos = elem.start + elem.len;
  }
  return token;
}

// ── XML parsing ─────────────────────────────────────────────────────

function parseXmlResponse<T>(dataBuffer: string): T {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributesGroupName: '$',
    textNodeName: '_',
  });
  return parser.parse(dataBuffer);
}

// ── HTTP helpers ────────────────────────────────────────────────────

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

function extractAuthToken(headers: http.IncomingHttpHeaders): string | null {
  const wwwAuth = headers['www-authenticate'];
  if (!wwwAuth) return null;
  const authHeader = Array.isArray(wwwAuth) ? wwwAuth[0] : wwwAuth;
  const match = authHeader.match(/(?:Negotiate|NTLM)\s+([A-Za-z0-9+/=]+)/i);
  return match ? match[1] : null;
}

// ── NTLM handshake ──────────────────────────────────────────────────

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
    // Step 1: Send Type 1 (raw NTLM with Negotiate scheme)
    const type1Full = ntlm.createType1Message('', parsed.domain);
    const type1Raw = Buffer.from(type1Full.replace(/^NTLM\s+/, ''), 'base64');

    const step1Response = await makeRequest(
      {
        ...baseOptions,
        headers: {
          ...baseOptions.headers,
          Authorization: `Negotiate ${type1Raw.toString('base64')}`,
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

    // Unwrap SPNEGO if the server wrapped the Type 2 response
    const type2Bytes = Buffer.from(type2Token, 'base64');
    const type2Raw = spnegoUnwrap(type2Bytes);

    const type2Message = ntlm.decodeType2Message(type2Raw.toString('base64'));

    logger.debug('NTLM Step 2: Type 2 decoded', {
      targetName: type2Message.targetName,
      domain: type2Message.targetInfo?.parsed['DOMAIN'],
    });

    // Step 3: Send Type 3 authentication
    const type3Full = ntlm.createType3Message(
      type2Message,
      parsed.user,
      password,
      '',
      parsed.domain,
      type1Raw,
      type2Raw
    );
    const type3Raw = Buffer.from(type3Full.replace(/^NTLM\s+/, ''), 'base64');

    const step3Response = await makeRequest(
      {
        ...baseOptions,
        headers: {
          ...baseOptions.headers,
          Authorization: `Negotiate ${type3Raw.toString('base64')}`,
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

// ── Public API ──────────────────────────────────────────────────────

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
