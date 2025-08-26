const { WinRMRepl } = require('../dist/index.js');

async function main() {
  // Configuration for the Windows machine
  const config = {
    host: '192.168.1.100', // Replace with your Windows machine IP
    username: 'Administrator', // Replace with your username
    password: 'your-password', // Replace with your password
    port: 5985, // Default WinRM HTTP port
  };

  // Create a new REPL session
  const repl = new WinRMRepl(config);

  try {
    console.log('Starting REPL session...');
    await repl.start();
    console.log('REPL session started successfully!');

    // Example 1: Basic command execution
    console.log('\n=== Running basic commands ===');

    let result = await repl.executeCommand('echo Hello from Windows!');
    console.log('Command output:', result.output);
    console.log('Execution time:', result.executionTime + 'ms');

    // Example 2: Check current directory (persistent across commands)
    result = await repl.executeCommand('cd');
    console.log('Current directory:', result.output);

    // Example 3: Change directory and list files
    result = await repl.executeCommand('cd C:\\');
    console.log('Changed to C:\\:', result.output);

    result = await repl.executeCommand('dir');
    console.log('Files in C:\\:', result.output);

    // Example 4: PowerShell commands
    console.log('\n=== Running PowerShell commands ===');

    result = await repl.executePowershell('Get-Date');
    console.log('Current date/time:', result.output);

    result = await repl.executePowershell(
      'Get-ComputerInfo | Select-Object WindowsProductName, TotalPhysicalMemory'
    );
    console.log('Computer info:', result.output);

    // Example 5: Environment variables persist
    console.log('\n=== Testing persistence ===');

    result = await repl.executeCommand('set MY_VAR=Hello World');
    console.log('Set environment variable:', result.output);

    result = await repl.executeCommand('echo %MY_VAR%');
    console.log('Environment variable value:', result.output);

    // Example 6: Error handling
    console.log('\n=== Testing error handling ===');

    result = await repl.executeCommand('nonexistent-command');
    if (result.error) {
      console.log('Command failed as expected:', result.error);
    } else {
      console.log('Unexpected success:', result.output);
    }

    // Example 7: Session info
    console.log('\n=== Session information ===');
    const sessionInfo = repl.getSessionInfo();
    if (sessionInfo) {
      console.log('Session active:', sessionInfo.isActive);
      console.log('Shell ID:', sessionInfo.shellId);
      console.log('Last activity:', sessionInfo.lastActivity);
    }
  } catch (error) {
    console.error('Error during REPL session:', error.message);
  } finally {
    // Always clean up the session
    console.log('\nClosing REPL session...');
    await repl.close();
    console.log('REPL session closed.');
  }
}

// Example of handling multiple concurrent sessions
async function multipleSessionsExample() {
  console.log('\n=== Multiple Sessions Example ===');

  const config = {
    host: '192.168.1.100',
    username: 'Administrator',
    password: 'your-password',
    port: 5985,
  };

  const session1 = new WinRMRepl(config);
  const session2 = new WinRMRepl(config);

  try {
    await Promise.all([session1.start(), session2.start()]);
    console.log('Both sessions started');

    // Run commands in parallel
    const [result1, result2] = await Promise.all([
      session1.executeCommand('echo Session 1'),
      session2.executeCommand('echo Session 2'),
    ]);

    console.log('Session 1 output:', result1.output);
    console.log('Session 2 output:', result2.output);
  } finally {
    await Promise.all([session1.close(), session2.close()]);
    console.log('Both sessions closed');
  }
}

// Run the examples
if (require.main === module) {
  main()
    .then(() => multipleSessionsExample())
    .catch(console.error);
}

module.exports = { main, multipleSessionsExample };
