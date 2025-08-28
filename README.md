# winrm-client

[![npm version](https://badge.fury.io/js/winrm-client.svg)](https://badge.fury.io/js/winrm-client)
[![Build Status](https://travis-ci.org/shide1989/winrm-client.svg?branch=master)](https://travis-ci.org/shide1989/winrm-client)
[![Build Status](https://dev.azure.com/SHONEJACOB/SHONEJACOB/_apis/build/status/shide1989.winrm-client?branchName=master)](https://dev.azure.com/SHONEJACOB/SHONEJACOB/_build/latest?definitionId=1?branchName=master)

⚠️ This is an updated fork of the original [nodejs-winrm](https://github.com/shoneslab/nodejs-winrm) project that doesn't seem to be maintained anymore.

winrm-client is a NodeJS client to access WinRM (Windows Remote Management) SOAP web service. It allows to execute commands on target windows machines.
Please visit [Microsoft's WinRM site](http://msdn.microsoft.com/en-us/library/aa384426.aspx) for WINRM details.

#### ⬆️ Migration from nodejs-winrm

Replace `shell` and `command` with `Shell` and `Command`.

```javascript
// CommonJS
const { Shell, Command } = require('winrm-client');
// ES6
import { Shell, Command } from 'winrm-client';
```

## Installation

```bash
# Using npm
npm install winrm-client

# Using pnpm
pnpm add winrm-client

# Using yarn
yarn add winrm-client
```

## Features

- 🔁 Supports both CommonJS and ES6 modules.
- 🏗️ Has types for all exported functions and interfaces.
- 🔁 Supports interactive commands that can automatically respond to prompts using three types of detection methods: (see [Interactive Commands](#interactive-commands))
  - Regex Patterns (traditional method)
  - Custom Sync Detectors (new)
  - Custom Async Detectors (new)
- 🔍 Supports debug logging using the `DEBUG` environment variable (see [Debug Logging](#debug-logging))
- 🧪 Supports testing (see [Testing](#testing))

## Supported NodeJS Versions

Supports NodeJS Version >= 16.0.0

Tested on NodeJS versions 16, 18, 20, and latest LTS.

## Supported WinRM Versions

As of now Winrm Version 3 is tested.

```
> winrm id

IdentifyResponse
    ProtocolVersion = http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd
    ProductVendor = Microsoft Corporation
    ProductVersion = OS: 10.0.xxxx SP: 0.0 Stack: 3.0
```

## Remote Installation

On the remote host, a PowerShell prompt, using the **Run as Administrator** option and paste in the following lines:

```
> winrm quickconfig
y
> winrm set winrm/config/service/Auth '@{Basic="true"}'
> winrm set winrm/config/service '@{AllowUnencrypted="true"}'
> winrm set winrm/config/winrs '@{MaxMemoryPerShellMB="1024"}'
```

On the client side where NodeJS is installed

`npm install winrm-client`

### Development Workflow

For development with TypeScript:

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Watch mode for development
npm run build:watch

# Lint TypeScript files
npm run lint

# Format code with Prettier
npm run format

# Check formatting
npm run format:check
```

### Debug Logging

To enable debug logging, set the `DEBUG` environment variable to `winrm` or `winrm:*`.

Possible values for `namespace` are:

- `*` // Enable debug logging for all namespaces
- `http`
- `shell`
- `command`
- `interactive`
- `runCommand`
- `runPowershell`

To enable debug logging for all namespaces, set the `DEBUG` environment variable to `winrm:*`.

```bash
DEBUG=winrm:* node index.js
```

## Examples

### Run a Single Command

#### JavaScript

```javascript
const winrm = require('winrm-client');
winrm.runCommand(
  'mkdir D:\\winrmtest001',
  '10.xxx.xxx.xxx',
  'username',
  'password',
  5985
);
winrm.runCommand(
  'ipconfig /all',
  '10.xxx.xxx.xxx',
  'username',
  'password',
  5985
);
```

#### TypeScript

```typescript
import { runCommand, runPowershell } from 'winrm-client';

async function executeCommand(): Promise<void> {
  try {
    const result = await runCommand(
      'mkdir D:\\winrmtest001',
      '10.xxx.xxx.xxx',
      'username',
      'password',
      5985
    );
    console.log('Command result:', result);

    const ipResult = await runCommand(
      'ipconfig /all',
      '10.xxx.xxx.xxx',
      'username',
      'password',
      5985
    );
    console.log('IP Config:', ipResult);
  } catch (error) {
    console.error('Error executing command:', error);
  }
}

executeCommand();
```

## Interactive Commands

WinRM Client supports interactive commands that can automatically respond to prompts using three types of detection methods:

1. **Regex Patterns** (traditional method)
2. **Custom Sync Detectors** (new)
3. **Custom Async Detectors** (new)

### Basic Interactive Command

```javascript
const winrm = require('winrm-client');

const prompts = [
  {
    pattern: /Enter your name:/i,
    response: 'John Doe',
  },
  {
    pattern: /Password:/i,
    response: 'secret123',
    isSecure: true, // Won't log the response
  },
];

const result = await winrm.runInteractivePowershell(
  'my-interactive-script.ps1',
  'host',
  'username',
  'password',
  5985,
  prompts,
  30000 // timeout in milliseconds
);
```

### Custom Sync Detectors

Use custom synchronous functions for complex prompt detection logic:

```javascript
const prompts = [
  {
    detector: (output) => {
      // Custom logic for detecting prompts
      const lines = output.split('\n');
      return lines.some(
        (line) =>
          line.toLowerCase().includes('password') ||
          line.toLowerCase().includes('passphrase')
      );
    },
    response: 'myPassword123',
    isSecure: true,
  },
  {
    detector: (output) => {
      // Multi-condition detection
      return output.includes('Continue?') && output.includes('(y/n)');
    },
    response: 'y',
  },
];
```

### Custom Async Detectors

Use async functions for detection that requires external API calls, database lookups, or other async operations:

```javascript
const prompts = [
  {
    asyncDetector: async (output) => {
      // Simulate API call or database lookup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Complex multi-line analysis
      const lines = output.split('\n');
      return lines.some((line) => {
        const cleanLine = line.trim().toLowerCase();
        return (
          cleanLine.includes('are you sure') && cleanLine.includes('continue')
        );
      });
    },
    response: 'yes',
  },
  {
    asyncDetector: async (output) => {
      // Example: External API validation
      const errorCodeMatch = output.match(/Error Code: (\d+)/);
      if (errorCodeMatch) {
        try {
          // Make external API call
          const response = await fetch(
            `https://api.example.com/errors/${errorCodeMatch[1]}`
          );
          const data = await response.json();
          return data.requiresConfirmation;
        } catch {
          return false; // Fallback to regex pattern if available
        }
      }
      return false;
    },
    pattern: /Do you want to retry/i, // Fallback pattern
    response: 'yes',
  },
];
```

### Detection Priority and Fallback

The detection methods are prioritized as follows:

1. **Async Detector** (highest priority)
2. **Sync Detector**
3. **Regex Pattern** (fallback)

If a custom detector fails with an error, the system will automatically fall back to the regex pattern if available:

### Error Handling

Custom detectors are wrapped in try-catch blocks to prevent failures from breaking the interactive flow:

- If a custom detector throws an error, it falls back to the regex pattern
- If both custom detector and regex pattern fail, the prompt is skipped
- Errors are logged for debugging purposes

## Testing

`npm test`

## Maintainers

- Sebastien Hideux (https://github.com/shide1989)

## Credits

- https://github.com/jacobludriks/winrmjs
