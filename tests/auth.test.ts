import {
  parseUsername,
  detectAuthMethod,
  createBasicAuth,
} from '../src/utils/auth';

describe('parseUsername', () => {
  describe('local username format', () => {
    it('should parse simple username', () => {
      const result = parseUsername('Administrator');
      expect(result).toEqual({
        user: 'Administrator',
        domain: '',
        format: 'local',
      });
    });

    it('should parse username with numbers', () => {
      const result = parseUsername('user123');
      expect(result).toEqual({
        user: 'user123',
        domain: '',
        format: 'local',
      });
    });
  });

  describe('domain prefix format (DOMAIN\\user)', () => {
    it('should parse domain prefix username', () => {
      const result = parseUsername('DOMAIN\\Administrator');
      expect(result).toEqual({
        user: 'Administrator',
        domain: 'DOMAIN',
        format: 'domain',
      });
    });

    it('should parse domain prefix with lowercase', () => {
      const result = parseUsername('mydomain\\myuser');
      expect(result).toEqual({
        user: 'myuser',
        domain: 'mydomain',
        format: 'domain',
      });
    });
  });

  describe('UPN format (user@domain.com)', () => {
    it('should parse UPN username', () => {
      const result = parseUsername('admin@company.com');
      expect(result).toEqual({
        user: 'admin',
        domain: 'company.com',
        format: 'upn',
      });
    });

    it('should parse UPN with subdomain', () => {
      const result = parseUsername('user@corp.company.com');
      expect(result).toEqual({
        user: 'user',
        domain: 'corp.company.com',
        format: 'upn',
      });
    });
  });
});

describe('detectAuthMethod', () => {
  it('should return basic for local username', () => {
    expect(detectAuthMethod('Administrator')).toBe('basic');
  });

  it('should return ntlm for domain prefix username', () => {
    expect(detectAuthMethod('DOMAIN\\user')).toBe('ntlm');
  });

  it('should return ntlm for UPN username', () => {
    expect(detectAuthMethod('user@domain.com')).toBe('ntlm');
  });
});

describe('createBasicAuth', () => {
  it('should create valid Basic auth header', () => {
    const auth = createBasicAuth('user', 'password');
    expect(auth).toBe(
      'Basic ' + Buffer.from('user:password').toString('base64')
    );
  });

  it('should handle special characters in password', () => {
    const auth = createBasicAuth('admin', 'p@ss:word!');
    expect(auth).toBe(
      'Basic ' + Buffer.from('admin:p@ss:word!').toString('base64')
    );
  });
});
