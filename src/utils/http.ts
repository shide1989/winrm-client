import { XMLParser } from 'fast-xml-parser';
import * as http from 'http';
import { createLogger } from './logger';
import { SoapEnvelope } from '../types';

const logger = createLogger('http');

export function sendHttp<T extends SoapEnvelope>(
  data: string,
  host: string,
  port: number,
  path: string,
  auth: string,
  timeout?: number
): Promise<T> {
  const xmlRequest = data;
  const options: http.RequestOptions = {
    host: host,
    port: port,
    path: path,
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/soap+xml;charset=UTF-8',
      'User-Agent': 'NodeJS WinRM Client',
      'Content-Length': Buffer.byteLength(xmlRequest),
    },
  };

  logger.debug('Sending HTTP request', { host, port, path, method: 'POST' });

  const promise = new Promise<T>((resolve, reject) => {
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
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        try {
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributesGroupName: '$',
            textNodeName: '_',
          });
          const result = parser.parse(dataBuffer);
          logger.debug('XML parsed successfully', result);
          resolve(result);
        } catch (err) {
          reject(new Error('Data Parsing error: ' + (err as Error).message));
        }
      });
    });

    req.on('error', (err) => {
      logger.debug('HTTP request error', err);
      reject(err);
    });

    if (xmlRequest) {
      req.write(xmlRequest);
    }
    req.end();

    if (timeout) {
      timeoutId = setTimeout(() => {
        logger.debug('Request timed out');
        req.destroy(new Error('Request timed out'));
      }, timeout);
    }
  });

  return promise;
}
