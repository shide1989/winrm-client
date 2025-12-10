import { runCommand, runPowershell } from '../../index';

const {
  JEST_WINRM_DOMAIN_USER,
  JEST_WINRM_DOMAIN_PASS,
  JEST_WINRM_DOMAIN_HOST,
  JEST_WINRM_DOMAIN_PORT = '5985',
} = process.env;

const hasNtlmCredentials =
  JEST_WINRM_DOMAIN_USER && JEST_WINRM_DOMAIN_PASS && JEST_WINRM_DOMAIN_HOST;

const HTTPS_PORTS = [443, 5986, 8443];

const port = Number(JEST_WINRM_DOMAIN_PORT);
const useHttps = HTTPS_PORTS.includes(port);
// For self-signed certificates in test environments
const rejectUnauthorized = false;

if (!hasNtlmCredentials) {
  throw new Error('Missing environment variables');
}

// Skip all tests if NTLM credentials are not provided
const describeNtlm = hasNtlmCredentials ? describe : describe.skip;

jest.setTimeout(10_000);

describeNtlm('NTLM Authentication', () => {
  it('should execute a command with DOMAIN\\user format', async () => {
    const result = await runCommand(
      'hostname',
      JEST_WINRM_DOMAIN_HOST,
      JEST_WINRM_DOMAIN_USER,
      JEST_WINRM_DOMAIN_PASS,
      port,
      false,
      useHttps,
      rejectUnauthorized
    );
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('should execute a powershell command with DOMAIN\\user format', async () => {
    const result = await runPowershell(
      'hostname',
      JEST_WINRM_DOMAIN_HOST,
      JEST_WINRM_DOMAIN_USER,
      JEST_WINRM_DOMAIN_PASS,
      port,
      useHttps,
      rejectUnauthorized
    );
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('should execute whoami to verify domain authentication', async () => {
    const result = await runCommand(
      'whoami',
      JEST_WINRM_DOMAIN_HOST,
      JEST_WINRM_DOMAIN_USER,
      JEST_WINRM_DOMAIN_PASS,
      port,
      false,
      useHttps,
      rejectUnauthorized
    );
    // Result should contain the domain or username
    expect(result.toLowerCase()).toContain(
      JEST_WINRM_DOMAIN_USER.split('\\').pop()?.toLowerCase() ||
        JEST_WINRM_DOMAIN_USER.split('@')[0].toLowerCase()
    );
  });
});
