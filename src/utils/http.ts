import { XMLParser } from 'fast-xml-parser';
import * as http from 'http';
import { createLogger } from './logger';

const logger = createLogger('http');

export function sendHttp(
  data: string,
  host: string,
  port: number,
  path: string,
  auth: string
): Promise<any> {
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

  return new Promise((resolve, reject) => {
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
  });
}
