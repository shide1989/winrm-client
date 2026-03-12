import {
  createType1Message,
  decodeType2Message,
  createType3Message,
} from '../src/utils/ntlm';
import {
  buildType2Buffer,
  TEST_CHALLENGE,
  TEST_TIMESTAMP,
  DEFAULT_FLAGS,
  FLAGS_UNICODE,
  FLAGS_NTLM2_KEY,
} from './helpers/ntlm-test-vectors';

describe('createType1Message', () => {
  it('returns an "NTLM " prefixed base64 string', () => {
    const result = createType1Message('', 'DOMAIN');
    expect(result).toMatch(/^NTLM [A-Za-z0-9+/=]+$/);
  });

  it('decoded buffer has valid NTLMSSP signature and type=1', () => {
    const result = createType1Message('', 'DOMAIN');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    expect(buf.toString('ascii', 0, 7)).toBe('NTLMSSP');
    expect(buf.readUInt32LE(8)).toBe(1);
  });

  it('includes domain name in the message', () => {
    const result = createType1Message('', 'TESTDOMAIN');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    // Domain security buffer at offset 16
    const domainLen = buf.readUInt16LE(16);
    const domainOffset = buf.readUInt32LE(20);
    expect(domainLen).toBe(10); // "TESTDOMAIN".length
    expect(buf.toString('ascii', domainOffset, domainOffset + domainLen)).toBe(
      'TESTDOMAIN'
    );
  });

  it('includes workstation name in the message', () => {
    const result = createType1Message('MYPC', '');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    // Workstation security buffer at offset 24
    const wsLen = buf.readUInt16LE(24);
    const wsOffset = buf.readUInt32LE(28);
    expect(wsLen).toBe(4); // "MYPC".length
    expect(buf.toString('ascii', wsOffset, wsOffset + wsLen)).toBe('MYPC');
  });

  it('sets NTLM2_KEY flag for NTLMv2 negotiation', () => {
    const result = createType1Message('', '');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    const flags = buf.readUInt32LE(12);
    // NTLM2_KEY = 1 << 19 = 0x80000
    expect(flags & 0x80000).toBeTruthy();
  });
});

describe('decodeType2Message', () => {
  it('parses a valid Type 2 buffer with flags, challenge, and targetName', () => {
    const buf = buildType2Buffer();
    const msg = decodeType2Message(buf.toString('base64'));

    expect(msg.flags).toBe(DEFAULT_FLAGS);
    expect(msg.challenge).toEqual(TEST_CHALLENGE);
    expect(msg.targetName).toBe('TESTDOMAIN');
    expect(msg.encoding).toBe('ucs2');
    expect(msg.version).toBe(2);
  });

  it('parses AV_PAIRs: computer name, domain, DNS names', () => {
    const buf = buildType2Buffer({
      computerName: 'DC01',
      domainName: 'CORP',
      dnsComputerName: 'dc01.corp.local',
      dnsDomainName: 'corp.local',
      dnsTreeName: 'corp.local',
    });
    const msg = decodeType2Message(buf.toString('base64'));

    expect(msg.targetInfo).toBeDefined();
    expect(msg.targetInfo!.parsed['SERVER']).toBe('DC01');
    expect(msg.targetInfo!.parsed['DOMAIN']).toBe('CORP');
    expect(msg.targetInfo!.parsed['FQDN']).toBe('dc01.corp.local');
    expect(msg.targetInfo!.parsed['DNS']).toBe('corp.local');
    expect(msg.targetInfo!.parsed['PARENT_DNS']).toBe('corp.local');
  });

  it('parses MsvAvTimestamp from AV_PAIRs', () => {
    const buf = buildType2Buffer({ timestamp: TEST_TIMESTAMP });
    const msg = decodeType2Message(buf.toString('base64'));

    expect(msg.targetInfo).toBeDefined();
    expect(msg.targetInfo!.timestamp).toEqual(TEST_TIMESTAMP);
  });

  it('parses MsvAvFlags from AV_PAIRs', () => {
    const buf = buildType2Buffer({ avFlags: 0x02 });
    const msg = decodeType2Message(buf.toString('base64'));

    expect(msg.targetInfo).toBeDefined();
    expect(msg.targetInfo!.flags).toBe(0x02);
  });

  it('strips "NTLM " prefix before decoding', () => {
    const buf = buildType2Buffer();
    const prefixed = 'NTLM ' + buf.toString('base64');
    const msg = decodeType2Message(prefixed);

    expect(msg.targetName).toBe('TESTDOMAIN');
    expect(msg.challenge).toEqual(TEST_CHALLENGE);
  });

  it('throws on invalid signature', () => {
    const buf = buildType2Buffer();
    // Corrupt the signature
    buf.write('XXXXXXXX', 0, 8, 'ascii');
    expect(() => decodeType2Message(buf.toString('base64'))).toThrow(
      'Invalid NTLM message signature'
    );
  });

  it('throws on wrong message type (not Type 2)', () => {
    const buf = buildType2Buffer();
    // Change message type to 1
    buf.writeUInt32LE(1, 8);
    expect(() => decodeType2Message(buf.toString('base64'))).toThrow(
      'Invalid NTLM message type (expected Type 2)'
    );
  });

  it('handles Type 2 without TARGET_INFO flag', () => {
    const flags = FLAGS_UNICODE | FLAGS_NTLM2_KEY; // no TARGET_INFO
    const buf = buildType2Buffer({ flags });
    const msg = decodeType2Message(buf.toString('base64'));

    expect(msg.targetInfo).toBeUndefined();
    expect(msg.targetName).toBe('TESTDOMAIN');
  });
});

describe('createType3Message', () => {
  function makeType2(
    opts?: Parameters<typeof buildType2Buffer>[0]
  ): ReturnType<typeof decodeType2Message> {
    const buf = buildType2Buffer(opts);
    return decodeType2Message(buf.toString('base64'));
  }

  it('returns an "NTLM " prefixed base64 string', () => {
    const type2 = makeType2();
    const result = createType3Message(type2, 'admin', 'password', '', 'DOMAIN');
    expect(result).toMatch(/^NTLM [A-Za-z0-9+/=]+$/);
  });

  it('decoded buffer has valid NTLMSSP signature and type=3', () => {
    const type2 = makeType2();
    const result = createType3Message(type2, 'admin', 'password', '', 'DOMAIN');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    expect(buf.toString('ascii', 0, 7)).toBe('NTLMSSP');
    expect(buf.readUInt32LE(8)).toBe(3);
  });

  it('contains LMv2 and NTLMv2 security buffers at correct offsets', () => {
    const type2 = makeType2();
    const result = createType3Message(type2, 'admin', 'password', '', 'DOMAIN');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    // LMv2 security buffer at offset 12
    const lmLen = buf.readUInt16LE(12);
    const lmOffset = buf.readUInt32LE(16);
    expect(lmLen).toBe(24); // LMv2 is always 24 bytes
    expect(lmOffset).toBeGreaterThanOrEqual(72);

    // NTLMv2 security buffer at offset 20
    const ntLen = buf.readUInt16LE(20);
    const ntOffset = buf.readUInt32LE(24);
    expect(ntLen).toBeGreaterThan(24); // NTLMv2 is variable but > 24
    expect(ntOffset).toBe(lmOffset + lmLen);
  });

  it('contains encrypted session key (non-zero, 16 bytes)', () => {
    const type2 = makeType2();
    const result = createType3Message(type2, 'admin', 'password', '', 'DOMAIN');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    // Session key security buffer at offset 52
    const skLen = buf.readUInt16LE(52);
    const skOffset = buf.readUInt32LE(56);
    expect(skLen).toBe(16);

    const sessionKey = buf.subarray(skOffset, skOffset + skLen);
    // Session key should be non-zero (encrypted random key)
    expect(sessionKey.some((b) => b !== 0)).toBe(true);
  });

  it('header is 88 bytes when MIC required (MsvAvFlags & 0x02)', () => {
    const type2 = makeType2({ avFlags: 0x02, timestamp: TEST_TIMESTAMP });
    const result = createType3Message(type2, 'admin', 'password', '', 'DOMAIN');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    // LMv2 starts at offset 88 (headerSize) when MIC is required
    const lmOffset = buf.readUInt32LE(16);
    expect(lmOffset).toBe(88);
  });

  it('header is 72 bytes when MIC not required', () => {
    const type2 = makeType2(); // no avFlags
    const result = createType3Message(type2, 'admin', 'password', '', 'DOMAIN');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    // LMv2 starts at offset 72 when no MIC
    const lmOffset = buf.readUInt32LE(16);
    expect(lmOffset).toBe(72);
  });

  it('MIC field (offset 72-88) is non-zero when type1Bytes + type2Bytes provided', () => {
    const type2Raw = buildType2Buffer({
      avFlags: 0x02,
      timestamp: TEST_TIMESTAMP,
    });
    const type2 = decodeType2Message(type2Raw.toString('base64'));
    const type1Bytes = Buffer.from('fake-type1-message');

    const result = createType3Message(
      type2,
      'admin',
      'password',
      '',
      'DOMAIN',
      type1Bytes,
      type2Raw
    );
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    const mic = buf.subarray(72, 88);
    expect(mic.some((b) => b !== 0)).toBe(true);
  });

  it('MIC field is zero when type1/type2 bytes not provided', () => {
    const type2 = makeType2({ avFlags: 0x02, timestamp: TEST_TIMESTAMP });

    const result = createType3Message(type2, 'admin', 'password', '', 'DOMAIN');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    const mic = buf.subarray(72, 88);
    expect(mic.every((b) => b === 0)).toBe(true);
  });

  it('uses server timestamp from AV_PAIR when available', () => {
    const type2 = makeType2({ timestamp: TEST_TIMESTAMP });
    const result = createType3Message(type2, 'admin', 'password', '', 'DOMAIN');
    const buf = Buffer.from(result.replace(/^NTLM\s+/, ''), 'base64');

    // NTLMv2 response blob contains the timestamp at a known offset within the blob
    // The blob is in the NTLMv2 security buffer
    const ntOffset = buf.readUInt32LE(24);
    // Within the NTLMv2 response: first 16 bytes = NTProofStr,
    // then blob: signature(4) + reserved(4) + timestamp(8)
    const tsOffset = ntOffset + 16 + 4 + 4;
    const extractedTs = buf.subarray(tsOffset, tsOffset + 8);
    expect(extractedTs).toEqual(TEST_TIMESTAMP);
  });
});
