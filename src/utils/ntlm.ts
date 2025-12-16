/**
 * NTLM authentication with pure JS MD4 (no OpenSSL dependency).
 * Based on ntlm-client but with js-md4 for Node 17+ compatibility.
 */
import * as crypto from 'crypto';
import md4 from 'js-md4';

// Re-export unchanged functions from ntlm-client
export { createType1Message, decodeType2Message } from 'ntlm-client';

/**
 * Create NT hash using pure JS MD4.
 * NT Hash = MD4(UTF16LE(password))
 */
function createNTLMHash(password: string): Buffer {
  const hash = md4.create();
  hash.update(Buffer.from(password, 'ucs2'));
  return Buffer.from(hash.arrayBuffer());
}

/**
 * Create NTLMv2 hash.
 */
function createNTLMv2Hash(
  ntlmHash: Buffer,
  username: string,
  targetName: string
): Buffer {
  const hmac = crypto.createHmac('md5', ntlmHash);
  // Per MS-NLMP spec: both username AND domain must be uppercased
  hmac.update(
    Buffer.from(username.toUpperCase() + targetName.toUpperCase(), 'ucs2')
  );
  return hmac.digest();
}

/**
 * Create random hex string.
 */
function createPseudoRandomValue(length: number): string {
  let str = '';
  while (str.length < length) {
    str += Math.floor(Math.random() * 16).toString(16);
  }
  return str;
}

/**
 * Create LMv2 response.
 */
function createLMv2Response(
  type2Message: Type2Message,
  username: string,
  ntlmHash: Buffer,
  nonce: string,
  domain: string
): Buffer {
  const buf = Buffer.alloc(24);
  // Use the user-provided domain for the hash, not type2Message.targetName
  const ntlm2Hash = createNTLMv2Hash(
    ntlmHash,
    username,
    domain || type2Message.targetName
  );
  const hmac = crypto.createHmac('md5', ntlm2Hash);

  // server challenge
  type2Message.challenge.copy(buf, 8);

  // client nonce
  buf.write(nonce, 16, 'hex');

  // create hash
  hmac.update(buf.slice(8));
  const hashedBuffer = hmac.digest();
  hashedBuffer.copy(buf);

  return buf;
}

/**
 * Create NTLMv2 response.
 */
function createNTLMv2Response(
  type2Message: Type2Message,
  username: string,
  ntlmHash: Buffer,
  nonce: string,
  domain: string
): Buffer {
  const targetInfoLen = type2Message.targetInfo?.buffer?.length || 0;
  const buf = Buffer.alloc(48 + targetInfoLen);
  // Use the user-provided domain for the hash, not type2Message.targetName
  const ntlm2Hash = createNTLMv2Hash(
    ntlmHash,
    username,
    domain || type2Message.targetName
  );
  const hmac = crypto.createHmac('md5', ntlm2Hash);

  // First 8 bytes reserved for hash result

  // server challenge (bytes 8-16)
  type2Message.challenge.copy(buf, 8);

  // blob signature (bytes 16-20)
  buf.writeUInt32BE(0x01010000, 16);

  // reserved (bytes 20-24)
  buf.writeUInt32LE(0, 20);

  // timestamp (bytes 24-32)
  // 11644473600000 = diff between 1970 and 1601
  const timestamp = ((Date.now() + 11644473600000) * 10000).toString(16);
  const timestampLow = Number(
    '0x' + timestamp.substring(Math.max(0, timestamp.length - 8))
  );
  const timestampHigh = Number(
    '0x' + timestamp.substring(0, Math.max(0, timestamp.length - 8))
  );
  buf.writeUInt32LE(timestampLow, 24);
  buf.writeUInt32LE(timestampHigh, 28);

  // random client nonce (bytes 32-40)
  buf.write(nonce, 32, 'hex');

  // zero (bytes 40-44)
  buf.writeUInt32LE(0, 40);

  // target info (bytes 44+)
  if (type2Message.targetInfo?.buffer) {
    type2Message.targetInfo.buffer.copy(buf, 44);
  }

  // zero after target info
  buf.writeUInt32LE(0, 44 + targetInfoLen);

  hmac.update(buf.slice(8));
  const hashedBuffer = hmac.digest();
  hashedBuffer.copy(buf);

  return buf;
}

interface Type2Message {
  flags: number;
  encoding: string;
  version: number;
  challenge: Buffer;
  targetName: string;
  targetInfo?: {
    buffer: Buffer;
  };
}

/**
 * Create NTLM Type 3 (Authenticate) message.
 * Compatible with ntlm-client but uses pure JS MD4.
 */
export function createType3Message(
  type2Message: Type2Message,
  username: string,
  password: string,
  workstation: string,
  target: string
): string {
  let dataPos = 52;
  const buf = Buffer.alloc(1024);

  // Use target from type2 if not provided
  const actualTarget = target || type2Message.targetName;

  // signature
  buf.write('NTLMSSP\0', 0, 8, 'ascii');

  // message type
  buf.writeUInt32LE(3, 8);

  if (type2Message.version === 2) {
    dataPos = 64;

    const ntlmHash = createNTLMHash(password);
    const nonce = createPseudoRandomValue(16);
    const lmv2 = createLMv2Response(
      type2Message,
      username,
      ntlmHash,
      nonce,
      actualTarget
    );
    const ntlmv2 = createNTLMv2Response(
      type2Message,
      username,
      ntlmHash,
      nonce,
      actualTarget
    );

    // lmv2 security buffer
    buf.writeUInt16LE(lmv2.length, 12);
    buf.writeUInt16LE(lmv2.length, 14);
    buf.writeUInt32LE(dataPos, 16);
    lmv2.copy(buf, dataPos);
    dataPos += lmv2.length;

    // ntlmv2 security buffer
    buf.writeUInt16LE(ntlmv2.length, 20);
    buf.writeUInt16LE(ntlmv2.length, 22);
    buf.writeUInt32LE(dataPos, 24);
    ntlmv2.copy(buf, dataPos);
    dataPos += ntlmv2.length;
  } else {
    // NTLMv1 - not typically used anymore but included for completeness
    throw new Error('NTLMv1 not supported - server requires NTLMv2');
  }

  const encoding = type2Message.encoding as BufferEncoding;

  // target name security buffer
  const targetLen =
    encoding === 'ascii' ? actualTarget.length : actualTarget.length * 2;
  buf.writeUInt16LE(targetLen, 28);
  buf.writeUInt16LE(targetLen, 30);
  buf.writeUInt32LE(dataPos, 32);
  dataPos += buf.write(actualTarget, dataPos, encoding);

  // user name security buffer
  const usernameLen =
    encoding === 'ascii' ? username.length : username.length * 2;
  buf.writeUInt16LE(usernameLen, 36);
  buf.writeUInt16LE(usernameLen, 38);
  buf.writeUInt32LE(dataPos, 40);
  dataPos += buf.write(username, dataPos, encoding);

  // workstation name security buffer
  const workstationLen =
    encoding === 'ascii' ? workstation.length : workstation.length * 2;
  buf.writeUInt16LE(workstationLen, 44);
  buf.writeUInt16LE(workstationLen, 46);
  buf.writeUInt32LE(dataPos, 48);
  dataPos += buf.write(workstation, dataPos, encoding);

  if (type2Message.version === 2) {
    // session key security buffer
    buf.writeUInt16LE(0, 52);
    buf.writeUInt16LE(0, 54);
    buf.writeUInt32LE(0, 56);

    // flags
    buf.writeUInt32LE(type2Message.flags, 60);
  }

  return 'NTLM ' + buf.toString('base64', 0, dataPos);
}
