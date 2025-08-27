const winrm = require('../dist/index.js');

// Example using custom sync and async detectors
async function customDetectorExample() {
  try {
    // Example prompts with custom detectors
    const prompts = [
      {
        // Traditional regex pattern
        pattern: /Enter your name:/i,
        response: 'John Doe',
      },
      {
        // Custom sync detector for password prompts
        detector: (output) => {
          // More sophisticated password detection
          const lowercaseOutput = output.toLowerCase();
          return lowercaseOutput.includes('password') || 
                 lowercaseOutput.includes('passphrase') ||
                 lowercaseOutput.includes('secret');
        },
        response: 'mySecretPassword123',
        isSecure: true, // Don't log the response
      },
      {
        // Custom async detector for complex logic
        asyncDetector: async (output) => {
          // Simulate async processing (e.g., checking against a database, API call, etc.)
          await new Promise(resolve => setTimeout(resolve, 10));
          
          // Check for complex multi-line confirmation prompts
          const lines = output.split('\n');
          return lines.some(line => {
            const cleanLine = line.trim().toLowerCase();
            return cleanLine.includes('are you sure') && 
                   cleanLine.includes('(y/n)');
          });
        },
        response: 'y',
      },
      {
        // Fallback detector with both custom and pattern
        detector: (output) => output.includes('Continue?'),
        pattern: /continue/i, // Will be used as fallback if detector fails
        response: 'yes',
      },
    ];

    // Example PowerShell command that might require interaction
    const command = `
      Write-Host 'Enter your name:' -NoNewline; $name = Read-Host;
      Write-Host 'Enter password:' -NoNewline; $pass = Read-Host -AsSecureString;
      Write-Host 'Are you sure you want to continue? (y/n):' -NoNewline; $confirm = Read-Host;
      Write-Host "Name: $name, Confirmed: $confirm"
    `;

    const result = await winrm.runInteractivePowershell(
      command,
      'your-host',
      'your-username', 
      'your-password',
      5985,
      prompts,
      30000 // 30 second timeout
    );

    console.log('Command result:', result);
  } catch (error) {
    console.error('Exception occurred:', error.message);
  }
}

// Example showing complex async detection with external API
async function advancedAsyncDetectorExample() {
  const prompts = [
    {
      asyncDetector: async (output) => {
        // Example: Check if output contains specific error codes that need dynamic lookup
        const errorCodeMatch = output.match(/Error Code: (\d+)/);
        if (errorCodeMatch) {
          const errorCode = errorCodeMatch[1];
          
          // Simulate API call to check if this error needs special handling
          try {
            // In reality, this might be:
            // const response = await fetch(`https://api.errors.com/codes/${errorCode}`);
            // const data = await response.json();
            // return data.requiresConfirmation;
            
            await new Promise(resolve => setTimeout(resolve, 100)); // Simulate API delay
            return ['404', '500', '503'].includes(errorCode);
          } catch (apiError) {
            console.warn('API lookup failed, falling back to pattern matching');
            return false;
          }
        }
        return false;
      },
      pattern: /Do you want to retry/i, // Fallback pattern
      response: 'yes',
    },
  ];

  console.log('Advanced async detector example configured');
  console.log('This would be used with actual WinRM commands...');
}

// Export for use in other modules
module.exports = {
  customDetectorExample,
  advancedAsyncDetectorExample,
};

// Run examples if executed directly
if (require.main === module) {
  console.log('=== Custom Detector Examples ===');
  console.log('Note: These examples require actual WinRM server credentials');
  console.log('Replace host, username, and password with actual values');
  
  // Uncomment to run with actual credentials:
  // customDetectorExample();
  // advancedAsyncDetectorExample();
}
