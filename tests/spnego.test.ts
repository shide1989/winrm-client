import { spnegoUnwrap } from '../src/utils/http';

describe('spnegoUnwrap', () => {
  it('returns raw NTLM token unchanged when input starts with "NTLMSSP"', () => {
    // Build a minimal NTLM Type 1 message header
    const ntlmToken = Buffer.alloc(32);
    ntlmToken.write('NTLMSSP\0', 0, 8, 'ascii');
    ntlmToken.writeUInt32LE(1, 8); // Type 1

    const result = spnegoUnwrap(ntlmToken);
    expect(result).toBe(ntlmToken); // same reference
  });

  it('unwraps a valid SPNEGO NegTokenResp envelope to extract inner NTLM token', () => {
    // Build a fake NTLM token that will be wrapped in SPNEGO
    const ntlmPayload = Buffer.from('NTLMSSP\0' + 'challenge-data', 'ascii');

    // Wrap it in a minimal SPNEGO NegTokenResp:
    // [1] CONSTRUCTED (NegTokenResp)
    //   SEQUENCE
    //     [2] (responseToken)
    //       OCTET STRING <ntlmPayload>
    const octetString = Buffer.concat([
      Buffer.from([0x04, ntlmPayload.length]),
      ntlmPayload,
    ]);
    const contextTag2 = Buffer.concat([
      Buffer.from([0xa2, octetString.length]),
      octetString,
    ]);
    const sequence = Buffer.concat([
      Buffer.from([0x30, contextTag2.length]),
      contextTag2,
    ]);
    const outer = Buffer.concat([
      Buffer.from([0xa1, sequence.length]),
      sequence,
    ]);

    const result = spnegoUnwrap(outer);
    expect(result.toString('ascii', 0, 7)).toBe('NTLMSSP');
    expect(result.length).toBe(ntlmPayload.length);
    expect(Buffer.compare(result, ntlmPayload)).toBe(0);
  });

  it('returns original buffer on malformed/unknown SPNEGO data', () => {
    const garbage = Buffer.from([0xff, 0x01, 0x02, 0x03, 0x04]);
    const result = spnegoUnwrap(garbage);
    expect(result).toBe(garbage); // same reference — returned as-is
  });

  it('returns original buffer when SEQUENCE tag is missing', () => {
    // Outer tag present but inner is not a SEQUENCE (0x30)
    const bad = Buffer.from([0xa1, 0x04, 0x02, 0x02, 0x00, 0x00]);
    const result = spnegoUnwrap(bad);
    expect(result).toBe(bad);
  });
});
