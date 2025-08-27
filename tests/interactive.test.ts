import { runInteractivePowershell, runInteractiveCommand } from '../index';
import { InteractivePrompt } from '../src/types';

const { JEST_WINRM_PASS, JEST_WINRM_USER, JEST_WINRM_HOST } = process.env;

if (!JEST_WINRM_PASS || !JEST_WINRM_USER || !JEST_WINRM_HOST) {
  throw new Error('Missing environment variables');
}
jest.setTimeout(60_000);

describe('interactive commands', () => {
  const timeout = 30000; // 30 second timeout for tests

  it('should handle PowerShell prompt for confirmation', async () => {
    const prompts: InteractivePrompt[] = [
      {
        pattern: /\[Y\] Yes\s+\[N\] No.*\(default is "Y"\):/i,
        response: 'N',
      },
    ];

    const result = await runInteractivePowershell(
      'Remove-Item -Path "C:\\temp\\nonexistent.txt" -Confirm',
      JEST_WINRM_HOST,
      JEST_WINRM_USER,
      JEST_WINRM_PASS,
      5985,
      prompts,
      timeout
    );

    expect(result).toContain('Cannot find path');
  }, 45000);

  //TODO: skipped because there is no user to test with
  it.skip('should handle password prompts securely', async () => {
    const prompts: InteractivePrompt[] = [
      {
        pattern: /Password:/i,
        response: 'SecurePassword123!',
        isSecure: true,
      },
    ];

    const result = await runInteractivePowershell(
      '$cred = Get-Credential -UserName "testuser" -Message "Enter password"; Write-Host "Credential created"',
      JEST_WINRM_HOST,
      JEST_WINRM_USER,
      JEST_WINRM_PASS,
      5985,
      prompts,
      timeout
    );

    expect(result).toContain('Credential created');
  }, 45000);

  // TODO: fix this test
  it.skip('should handle multiple prompt patterns in sequence', async () => {
    const prompts: InteractivePrompt[] = [
      {
        pattern: /Enter your name:/i,
        response: 'TestUser',
      },
      {
        pattern: /Enter your age:/i,
        response: '25',
      },
      {
        pattern: /Confirm \(Y\/N\):/i,
        response: 'N',
      },
    ];

    const command = `
      Write-Host "Enter your name:" -NoNewline; $name = Read-Host;
      Write-Host "Enter your age:" -NoNewline; $age = Read-Host;
      Write-Host "Confirm (Y/N):" -NoNewline; $confirm = Read-Host;
      Write-Host "Name: $name, Age: $age, Confirmed: $confirm"
    `;

    const result = await runInteractivePowershell(
      command,
      JEST_WINRM_HOST,
      JEST_WINRM_USER,
      JEST_WINRM_PASS,
      5985,
      prompts,
      timeout
    );

    expect(result).toContain('Name: TestUser, Age: 25, Confirmed: Y');
  }, 45000);

  it('should handle CMD interactive commands', async () => {
    const prompts: InteractivePrompt[] = [
      {
        pattern: /Press any key to continue/i,
        response: ' ', // Space character
      },
    ];

    const result = await runInteractiveCommand(
      'echo Press any key to continue && pause',
      JEST_WINRM_HOST,
      JEST_WINRM_USER,
      JEST_WINRM_PASS,
      5985,
      prompts,
      timeout
    );

    expect(result).toContain('Press any key to continue');
  }, 45000);

  it('should timeout when no matching prompt is found', async () => {
    const prompts: InteractivePrompt[] = [
      {
        pattern: /This pattern will never match/i,
        response: 'response',
      },
    ];

    await expect(
      runInteractivePowershell(
        'Read-Host "Enter something"',
        JEST_WINRM_HOST,
        JEST_WINRM_USER,
        JEST_WINRM_PASS,
        5985,
        prompts,
        5000 // 5 second timeout for quicker test
      )
    ).rejects.toThrow('timed out');
  }, 10000);

  it('should handle commands that complete without interaction', async () => {
    const prompts: InteractivePrompt[] = [
      {
        pattern: /This won't be needed/i,
        response: 'not used',
      },
    ];

    const result = await runInteractivePowershell(
      'Write-Host "Simple command without interaction"',
      JEST_WINRM_HOST,
      JEST_WINRM_USER,
      JEST_WINRM_PASS,
      5985,
      prompts,
      timeout
    );

    expect(result).toContain('Simple command without interaction');
  }, 45000);
});
