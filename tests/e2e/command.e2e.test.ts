import { runCommand, runPowershell } from '../../index';

const { JEST_WINRM_PASS, JEST_WINRM_USER, JEST_WINRM_HOST } = process.env;

if (!JEST_WINRM_PASS || !JEST_WINRM_USER || !JEST_WINRM_HOST) {
  throw new Error('Missing environment variables');
}

jest.setTimeout(10_000);

describe('executeCommand', () => {
  it('should execute a command', async () => {
    const result = await runCommand(
      'hostname',
      JEST_WINRM_HOST,
      JEST_WINRM_USER,
      JEST_WINRM_PASS,
      5985
    );
    expect(result).toBe('EC2AMAZ-3MERTNG');
  });

  it('should execute a powershell command', async () => {
    const result = await runPowershell(
      'hostname',
      JEST_WINRM_HOST,
      JEST_WINRM_USER,
      JEST_WINRM_PASS,
      5985
    );
    expect(result).toBe('EC2AMAZ-3MERTNG');
  });
});
