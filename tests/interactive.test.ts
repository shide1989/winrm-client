import { runPowershell } from '../index';

const { JEST_WINRM_PASS, JEST_WINRM_USER, JEST_WINRM_HOST } = process.env;

if (!JEST_WINRM_PASS || !JEST_WINRM_USER || !JEST_WINRM_HOST) {
  throw new Error('Missing environment variables');
}

describe('interactive', () => {
  // TODO: This test is not working. It will need improvement since its not a real interactive command.
  it('should execute a powershell command with an interactive command', async () => {
    const result = await runPowershell(
      'Write-Host \\"Hello, World!\\"',
      JEST_WINRM_HOST,
      JEST_WINRM_USER,
      JEST_WINRM_PASS,
      5985
    );
    expect(result).toBe('Hello, World!');
  });
});
