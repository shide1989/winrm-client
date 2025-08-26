import * as http from 'http';
import { parseString } from 'xml2js';

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

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode > 299)) {
        reject(
          new Error(
            'Failed to process the request, status Code: ' + res.statusCode
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
        parseString(dataBuffer, (err, result) => {
          if (err) {
            reject(new Error('Data Parsing error: ' + err.message));
            return;
          }
          resolve(result);
        });
      });
    });

    req.on('error', (err) => {
      console.log('error', err);
      reject(err);
    });

    if (xmlRequest) {
      req.write(xmlRequest);
    }
    req.end();
  });
}
