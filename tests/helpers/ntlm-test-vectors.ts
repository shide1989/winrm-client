/**
 * Test helpers for building valid NTLM Type 2 challenge messages
 * without a real server. Used by ntlm.test.ts.
 */

const NTLMSIGNATURE = 'NTLMSSP\0';

// Flags used in tests
export const FLAGS_UNICODE = 1 << 0;
export const FLAGS_NTLM2_KEY = 1 << 19;
export const FLAGS_TARGET_INFO = 1 << 23;
export const DEFAULT_FLAGS =
  FLAGS_UNICODE | FLAGS_NTLM2_KEY | FLAGS_TARGET_INFO;

// Known test challenge bytes
export const TEST_CHALLENGE = Buffer.from([
  0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
]);

// Known test timestamp (2024-01-01 00:00:00 UTC as Windows FILETIME)
export const TEST_TIMESTAMP = Buffer.from([
  0x00, 0x80, 0x40, 0x61, 0x73, 0x2f, 0xda, 0x01,
]);

// AV_PAIR IDs
const MsvAvEOL = 0;
const MsvAvNbComputerName = 1;
const MsvAvNbDomainName = 2;
const MsvAvDnsComputerName = 3;
const MsvAvDnsDomainName = 4;
const MsvAvDnsTreeName = 5;
const MsvAvFlags = 6;
const MsvAvTimestamp = 7;

export interface BuildType2Options {
  flags?: number;
  challenge?: Buffer;
  targetName?: string;
  computerName?: string;
  domainName?: string;
  dnsComputerName?: string;
  dnsDomainName?: string;
  dnsTreeName?: string;
  avFlags?: number;
  timestamp?: Buffer;
}

function writeAvPair(id: number, data: Buffer): Buffer {
  const buf = Buffer.alloc(4 + data.length);
  buf.writeUInt16LE(id, 0);
  buf.writeUInt16LE(data.length, 2);
  data.copy(buf, 4);
  return buf;
}

function writeAvPairString(id: number, str: string): Buffer {
  return writeAvPair(id, Buffer.from(str, 'ucs2'));
}

function buildTargetInfo(opts: BuildType2Options): Buffer {
  const parts: Buffer[] = [];

  if (opts.computerName !== undefined) {
    parts.push(writeAvPairString(MsvAvNbComputerName, opts.computerName));
  }
  if (opts.domainName !== undefined) {
    parts.push(writeAvPairString(MsvAvNbDomainName, opts.domainName));
  }
  if (opts.dnsComputerName !== undefined) {
    parts.push(writeAvPairString(MsvAvDnsComputerName, opts.dnsComputerName));
  }
  if (opts.dnsDomainName !== undefined) {
    parts.push(writeAvPairString(MsvAvDnsDomainName, opts.dnsDomainName));
  }
  if (opts.dnsTreeName !== undefined) {
    parts.push(writeAvPairString(MsvAvDnsTreeName, opts.dnsTreeName));
  }
  if (opts.avFlags !== undefined) {
    const flagBuf = Buffer.alloc(4);
    flagBuf.writeUInt32LE(opts.avFlags);
    parts.push(writeAvPair(MsvAvFlags, flagBuf));
  }
  if (opts.timestamp) {
    parts.push(writeAvPair(MsvAvTimestamp, opts.timestamp));
  }

  // MsvAvEOL terminator
  const eol = Buffer.alloc(4);
  eol.writeUInt16LE(MsvAvEOL, 0);
  eol.writeUInt16LE(0, 2);
  parts.push(eol);

  return Buffer.concat(parts);
}

/**
 * Build a valid NTLM Type 2 (challenge) binary buffer.
 * Returns raw buffer — caller can base64-encode for decodeType2Message.
 */
export function buildType2Buffer(opts: BuildType2Options = {}): Buffer {
  const flags = opts.flags ?? DEFAULT_FLAGS;
  const challenge = opts.challenge ?? TEST_CHALLENGE;
  const targetName = opts.targetName ?? 'TESTDOMAIN';

  const targetNameBuf = Buffer.from(targetName, 'ucs2');
  const hasTargetInfo = flags & FLAGS_TARGET_INFO;
  const targetInfo = hasTargetInfo
    ? buildTargetInfo({
        computerName: opts.computerName ?? 'WIN-SERVER',
        domainName: opts.domainName ?? 'TESTDOMAIN',
        dnsComputerName: opts.dnsComputerName ?? 'win-server.test.local',
        dnsDomainName: opts.dnsDomainName ?? 'test.local',
        dnsTreeName: opts.dnsTreeName,
        avFlags: opts.avFlags,
        timestamp: opts.timestamp,
      })
    : Buffer.alloc(0);

  // Type 2 structure:
  // 0-7:   Signature (8 bytes)
  // 8-11:  Message type = 2 (4 bytes)
  // 12-13: Target name length (2 bytes)
  // 14-15: Target name max length (2 bytes)
  // 16-19: Target name offset (4 bytes)
  // 20-23: Flags (4 bytes)
  // 24-31: Challenge (8 bytes)
  // 32-39: Reserved (8 bytes)
  // 40-41: Target info length (2 bytes)
  // 42-43: Target info max length (2 bytes)
  // 44-47: Target info offset (4 bytes)
  // 48+:   Data (target name, then target info)

  const headerSize = hasTargetInfo ? 48 : 32;
  const targetNameOffset = headerSize;
  const targetInfoOffset = targetNameOffset + targetNameBuf.length;
  const totalSize = targetInfoOffset + targetInfo.length;

  const buf = Buffer.alloc(totalSize);

  // Signature
  buf.write(NTLMSIGNATURE, 0, 8, 'ascii');
  // Message type
  buf.writeUInt32LE(2, 8);
  // Target name security buffer
  buf.writeUInt16LE(targetNameBuf.length, 12);
  buf.writeUInt16LE(targetNameBuf.length, 14);
  buf.writeUInt32LE(targetNameOffset, 16);
  // Flags
  buf.writeUInt32LE(flags, 20);
  // Challenge
  challenge.copy(buf, 24);
  // Reserved (32-39) - already zero

  if (hasTargetInfo) {
    // Target info security buffer
    buf.writeUInt16LE(targetInfo.length, 40);
    buf.writeUInt16LE(targetInfo.length, 42);
    buf.writeUInt32LE(targetInfoOffset, 44);
  }

  // Data
  targetNameBuf.copy(buf, targetNameOffset);
  if (hasTargetInfo) {
    targetInfo.copy(buf, targetInfoOffset);
  }

  return buf;
}
