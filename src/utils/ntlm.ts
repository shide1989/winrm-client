/**
 * Self-contained NTLMv2 implementation (no ntlm-client dependency).
 * Covers Type 1 (Negotiate), Type 2 (Challenge) decoding with AV_PAIR parsing,
 * and Type 3 (Authenticate) with session key exchange, MIC, and BigInt timestamps.
 */
import * as crypto from 'crypto';
import md4 from 'js-md4';

const NTLMSIGNATURE = 'NTLMSSP\0';

const NTLMFLAG_NEGOTIATE_OEM = 1 << 1;
const NTLMFLAG_REQUEST_TARGET = 1 << 2;
const NTLMFLAG_NEGOTIATE_NTLM = 1 << 9;
const NTLMFLAG_NEGOTIATE_ALWAYS_SIGN = 1 << 15;

const NTLMFLAG_NEGOTIATE_UNICODE = 1 << 0;
const NTLMFLAG_NEGOTIATE_NTLM2_KEY = 1 << 19;
const NTLMFLAG_NEGOTIATE_TARGET_INFO = 1 << 23;

// AV_PAIR IDs (MS-NLMP §2.2.2.1)
const MsvAvEOL = 0;
const MsvAvNbComputerName = 1;
const MsvAvNbDomainName = 2;
const MsvAvDnsComputerName = 3;
const MsvAvDnsDomainName = 4;
const MsvAvDnsTreeName = 5;
const MsvAvFlags = 6;
const MsvAvTimestamp = 7;

export interface TargetInfo {
  parsed: Record<string, string>;
  buffer: Buffer;
  flags: number;
  timestamp: Buffer | null;
}

export interface Type2Message {
  flags: number;
  encoding: BufferEncoding;
  version: number;
  challenge: Buffer;
  targetName: string;
  targetInfo?: TargetInfo;
}

function createNTLMHash(password: string): Buffer {
  const hash = md4.create();
  hash.update(Buffer.from(password, 'ucs2'));
  return Buffer.from(hash.arrayBuffer());
}

function createNTLMv2Hash(
  ntlmHash: Buffer,
  username: string,
  domain: string
): Buffer {
  // Per MS-NLMP: HMAC_MD5(NT_HASH, Uppercase(UserName) || UserDom)
  // Note: UserDom is NOT uppercased per the spec
  return crypto
    .createHmac('md5', ntlmHash)
    .update(Buffer.from(username.toUpperCase() + domain, 'ucs2'))
    .digest();
}

function windowsTimestamp(): Buffer {
  const EPOCH_DIFF = 11644473600000n;
  const filetime = (BigInt(Date.now()) + EPOCH_DIFF) * 10000n;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(filetime);
  return buf;
}

// ── Type 1 (Negotiate) ─────────────────────────────────────────────

/**
 * Create NTLM Type 1 (Negotiate) message.
 * Returns "NTLM <base64>" string.
 */
export function createType1Message(
  workstation: string,
  domain: string
): string {
  const domainBytes = Buffer.from(domain, 'ascii');
  const workstationBytes = Buffer.from(workstation, 'ascii');

  // Header: 32 bytes fixed + domain + workstation
  const headerSize = 32;
  const domainOffset = headerSize;
  const workstationOffset = domainOffset + domainBytes.length;
  const totalSize = workstationOffset + workstationBytes.length;

  const buf = Buffer.alloc(totalSize);

  // Signature
  buf.write(NTLMSIGNATURE, 0, 8, 'ascii');
  // Message type = 1
  buf.writeUInt32LE(1, 8);
  // Flags: OEM | REQUEST_TARGET | NTLM | ALWAYS_SIGN | NTLM2_KEY
  const flags =
    NTLMFLAG_NEGOTIATE_OEM |
    NTLMFLAG_REQUEST_TARGET |
    NTLMFLAG_NEGOTIATE_NTLM |
    NTLMFLAG_NEGOTIATE_ALWAYS_SIGN |
    NTLMFLAG_NEGOTIATE_NTLM2_KEY;
  buf.writeUInt32LE(flags, 12);

  // Domain security buffer (offset 16)
  buf.writeUInt16LE(domainBytes.length, 16);
  buf.writeUInt16LE(domainBytes.length, 18);
  buf.writeUInt32LE(domainOffset, 20);

  // Workstation security buffer (offset 24)
  buf.writeUInt16LE(workstationBytes.length, 24);
  buf.writeUInt16LE(workstationBytes.length, 26);
  buf.writeUInt32LE(workstationOffset, 28);

  // Data
  domainBytes.copy(buf, domainOffset);
  workstationBytes.copy(buf, workstationOffset);

  return 'NTLM ' + buf.toString('base64');
}

// ── Type 2 (Challenge) decoding ────────────────────────────────────

export function decodeType2Message(str: string): Type2Message {
  // Strip "NTLM " prefix if present
  const ntlmMatch = /^NTLM\s+(.+)$/.exec(str);
  if (ntlmMatch) str = ntlmMatch[1];

  const buf = Buffer.from(str, 'base64');

  if (buf.toString('ascii', 0, NTLMSIGNATURE.length) !== NTLMSIGNATURE) {
    throw new Error('Invalid NTLM message signature');
  }
  if (buf.readUInt32LE(8) !== 2) {
    throw new Error('Invalid NTLM message type (expected Type 2)');
  }

  const flags = buf.readUInt32LE(20);
  const encoding: BufferEncoding =
    flags & NTLMFLAG_NEGOTIATE_UNICODE ? 'ucs2' : 'ascii';
  const version = flags & NTLMFLAG_NEGOTIATE_NTLM2_KEY ? 2 : 1;
  const challenge = Buffer.alloc(8);
  buf.copy(challenge, 0, 24, 32);

  // Target name
  const targetNameLen = buf.readUInt16LE(12);
  const targetNameOffset = buf.readUInt32LE(16);
  const targetName =
    targetNameLen > 0
      ? buf.toString(
          encoding,
          targetNameOffset,
          targetNameOffset + targetNameLen
        )
      : '';

  // Target info (AV_PAIRs)
  let targetInfo: TargetInfo | undefined;
  if (flags & NTLMFLAG_NEGOTIATE_TARGET_INFO) {
    const tiLen = buf.readUInt16LE(40);
    const tiOffset = buf.readUInt32LE(44);

    const tiBuffer = Buffer.alloc(tiLen);
    buf.copy(tiBuffer, 0, tiOffset, tiOffset + tiLen);

    const parsed: Record<string, string> = {};
    let avFlags = 0;
    let avTimestamp: Buffer | null = null;

    let pos = tiOffset;
    while (pos < tiOffset + tiLen) {
      const avId = buf.readUInt16LE(pos);
      pos += 2;
      const avLen = buf.readUInt16LE(pos);
      pos += 2;

      if (avId === MsvAvEOL) break;

      switch (avId) {
        case MsvAvNbComputerName:
          parsed['SERVER'] = buf.toString('ucs2', pos, pos + avLen);
          break;
        case MsvAvNbDomainName:
          parsed['DOMAIN'] = buf.toString('ucs2', pos, pos + avLen);
          break;
        case MsvAvDnsComputerName:
          parsed['FQDN'] = buf.toString('ucs2', pos, pos + avLen);
          break;
        case MsvAvDnsDomainName:
          parsed['DNS'] = buf.toString('ucs2', pos, pos + avLen);
          break;
        case MsvAvDnsTreeName:
          parsed['PARENT_DNS'] = buf.toString('ucs2', pos, pos + avLen);
          break;
        case MsvAvFlags:
          avFlags = buf.readUInt32LE(pos);
          break;
        case MsvAvTimestamp:
          avTimestamp = Buffer.alloc(8);
          buf.copy(avTimestamp, 0, pos, pos + 8);
          break;
      }
      pos += avLen;
    }

    targetInfo = {
      parsed,
      buffer: tiBuffer,
      flags: avFlags,
      timestamp: avTimestamp,
    };
  }

  return { flags, encoding, version, challenge, targetName, targetInfo };
}

// ── Type 3 (Authenticate) ──────────────────────────────────────────

function createLMv2Response(
  type2Message: Type2Message,
  username: string,
  ntlmHash: Buffer,
  nonce: Buffer,
  domain: string
): Buffer {
  const ntlm2Hash = createNTLMv2Hash(
    ntlmHash,
    username,
    domain || type2Message.targetName
  );
  const hmac = crypto.createHmac('md5', ntlm2Hash);
  const buf = Buffer.alloc(24);

  type2Message.challenge.copy(buf, 8);
  nonce.copy(buf, 16);

  hmac.update(buf.subarray(8));
  hmac.digest().copy(buf);
  return buf;
}

function createNTLMv2Response(
  type2Message: Type2Message,
  username: string,
  ntlmHash: Buffer,
  nonce: Buffer,
  domain: string
): Buffer {
  const targetInfoLen = type2Message.targetInfo?.buffer?.length || 0;
  const ntlm2Hash = createNTLMv2Hash(
    ntlmHash,
    username,
    domain || type2Message.targetName
  );

  // NTLMv2 blob: 8 (hash placeholder) + 8 (challenge) + blob structure + targetInfo + 4 (zero)
  const blobLen = 28 + targetInfoLen + 4; // signature(4) + reserved(4) + timestamp(8) + nonce(8) + reserved(4) + targetInfo + zero(4)
  const buf = Buffer.alloc(8 + 8 + blobLen); // hash(8) + challenge(8) + blob

  // server challenge (bytes 8-16)
  type2Message.challenge.copy(buf, 8);

  // blob starts at offset 16
  let pos = 16;

  // blob signature
  buf.writeUInt32BE(0x01010000, pos);
  pos += 4;

  // reserved
  buf.writeUInt32LE(0, pos);
  pos += 4;

  // timestamp — use server timestamp from AV_PAIR if available, otherwise generate
  const ts = type2Message.targetInfo?.timestamp || windowsTimestamp();
  ts.copy(buf, pos);
  pos += 8;

  // client nonce
  nonce.copy(buf, pos);
  pos += 8;

  // reserved
  buf.writeUInt32LE(0, pos);
  pos += 4;

  // target info
  if (type2Message.targetInfo?.buffer) {
    type2Message.targetInfo.buffer.copy(buf, pos);
    pos += targetInfoLen;
  }

  // zero terminator
  buf.writeUInt32LE(0, pos);

  // HMAC over server challenge + blob
  const hmac = crypto.createHmac('md5', ntlm2Hash);
  hmac.update(buf.subarray(8));
  hmac.digest().copy(buf);

  // Full buffer: NTProofStr(16) + blob — the 16-byte HMAC overwrites
  // both the 8-byte placeholder and 8-byte server challenge at offset 0
  return buf;
}

/**
 * Create NTLM Type 3 (Authenticate) message.
 * Supports MIC when the server's Type 2 requests it via MsvAvFlags.
 *
 * Returns { message, type1Bytes } so the caller can provide type1Bytes
 * for MIC computation if needed. In practice, MIC is computed here
 * and the caller just needs the message string.
 */
export function createType3Message(
  type2Message: Type2Message,
  username: string,
  password: string,
  workstation: string,
  target: string,
  type1Bytes?: Buffer,
  type2Bytes?: Buffer
): string {
  const buf = Buffer.alloc(4096);
  const encoding = type2Message.encoding;

  // For the NTLMv2 hash, use the server's authoritative domain from Type 2
  // (MsvAvNbDomainName or targetName), NOT the user-provided domain.
  // The DC computes the hash with its own domain name, so we must match.
  const hashTarget =
    type2Message.targetInfo?.parsed['DOMAIN'] ||
    type2Message.targetName ||
    target;
  // For the Type 3 domain security buffer, use the server's domain too
  const actualTarget = hashTarget;

  // Check if MIC is required
  const micRequired = (type2Message.targetInfo?.flags ?? 0) & 0x02;
  // Header size: 64 base + 16 for MIC if needed = 80
  const headerSize = micRequired ? 88 : 72;
  let dataPos = headerSize;

  // Signature
  buf.write(NTLMSIGNATURE, 0, 8, 'ascii');
  // Message type
  buf.writeUInt32LE(3, 8);

  const ntlmHash = createNTLMHash(password);
  const nonce = crypto.randomBytes(8);
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

  // LMv2 security buffer (offset 12)
  buf.writeUInt16LE(lmv2.length, 12);
  buf.writeUInt16LE(lmv2.length, 14);
  buf.writeUInt32LE(dataPos, 16);
  lmv2.copy(buf, dataPos);
  dataPos += lmv2.length;

  // NTLMv2 security buffer (offset 20)
  buf.writeUInt16LE(ntlmv2.length, 20);
  buf.writeUInt16LE(ntlmv2.length, 22);
  buf.writeUInt32LE(dataPos, 24);
  ntlmv2.copy(buf, dataPos);
  dataPos += ntlmv2.length;

  // Target name security buffer (offset 28)
  const targetBytes = Buffer.from(actualTarget, encoding);
  buf.writeUInt16LE(targetBytes.length, 28);
  buf.writeUInt16LE(targetBytes.length, 30);
  buf.writeUInt32LE(dataPos, 32);
  targetBytes.copy(buf, dataPos);
  dataPos += targetBytes.length;

  // User name security buffer (offset 36)
  const usernameBytes = Buffer.from(username, encoding);
  buf.writeUInt16LE(usernameBytes.length, 36);
  buf.writeUInt16LE(usernameBytes.length, 38);
  buf.writeUInt32LE(dataPos, 40);
  usernameBytes.copy(buf, dataPos);
  dataPos += usernameBytes.length;

  // Workstation name security buffer (offset 44)
  const workstationBytes = Buffer.from(workstation, encoding);
  buf.writeUInt16LE(workstationBytes.length, 44);
  buf.writeUInt16LE(workstationBytes.length, 46);
  buf.writeUInt32LE(dataPos, 48);
  workstationBytes.copy(buf, dataPos);
  dataPos += workstationBytes.length;

  // Session key security buffer (offset 52) — compute and include
  // SessionBaseKey = HMAC_MD5(NTLMv2Hash, first 16 bytes of NTLMv2 response)
  const ntlm2Hash = createNTLMv2Hash(ntlmHash, username, actualTarget);
  const sessionBaseKey = crypto
    .createHmac('md5', ntlm2Hash)
    .update(ntlmv2.subarray(0, 16))
    .digest();

  // ExportedSessionKey = random, encrypted with SessionBaseKey for key exchange
  const exportedSessionKey = crypto.randomBytes(16);
  const rc4 = crypto.createCipheriv('rc4', sessionBaseKey, '');
  const encryptedSessionKey = rc4.update(exportedSessionKey);

  buf.writeUInt16LE(encryptedSessionKey.length, 52);
  buf.writeUInt16LE(encryptedSessionKey.length, 54);
  buf.writeUInt32LE(dataPos, 56);
  encryptedSessionKey.copy(buf, dataPos);
  dataPos += encryptedSessionKey.length;

  // Flags (offset 60)
  buf.writeUInt32LE(type2Message.flags >>> 0, 60);

  // Version (offset 64) — 8 bytes, optional but helps with compat
  // Major.Minor.Build.NTLMRevision = 10.0.19041.15
  buf.writeUInt8(10, 64); // Major
  buf.writeUInt8(0, 65); // Minor
  buf.writeUInt16LE(19041, 66); // Build
  buf.writeUInt8(0, 68); // Revision (padding)
  buf.writeUInt8(0, 69);
  buf.writeUInt8(0, 70);
  buf.writeUInt8(15, 71); // NTLM revision current

  // MIC (offset 72) — 16 bytes, zero first then compute
  if (micRequired && type1Bytes && type2Bytes) {
    // Zero the MIC field first
    buf.fill(0, 72, 88);

    const type3Bytes = buf.subarray(0, dataPos);
    const mic = crypto
      .createHmac('md5', exportedSessionKey)
      .update(type1Bytes)
      .update(type2Bytes)
      .update(type3Bytes)
      .digest();
    mic.copy(buf, 72);
  } else if (micRequired) {
    // MIC required but we don't have type1/type2 bytes — zero it
    // This shouldn't happen if the caller passes them correctly
    buf.fill(0, 72, 88);
  }

  return 'NTLM ' + buf.toString('base64', 0, dataPos);
}
