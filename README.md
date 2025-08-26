# winrm-client

[![npm version](https://badge.fury.io/js/winrm-client.svg)](https://badge.fury.io/js/winrm-client)
[![Build Status](https://travis-ci.org/shide1989/winrm-client.svg?branch=master)](https://travis-ci.org/shide1989/winrm-client)
[![Build Status](https://dev.azure.com/SHONEJACOB/SHONEJACOB/_apis/build/status/shide1989.winrm-client?branchName=master)](https://dev.azure.com/SHONEJACOB/SHONEJACOB/_build/latest?definitionId=1?branchName=master)

⚠️ This is an updated fork of the original [nodejs-winrm](https://github.com/shoneslab/nodejs-winrm) project that doesn't seem to be maintained anymore.

winrm-client is a NodeJS client to access WinRM (Windows Remote Management) SOAP web service. It allows to execute commands on target windows machines both as single commands and in persistent REPL-style sessions.
Please visit [Microsoft's WinRM site](http://msdn.microsoft.com/en-us/library/aa384426.aspx) for WINRM details.

### ⬆️ Migration from nodejs-winrm

Replace `shell` and `command` with `Shell` and `Command`.

```javascript
const { Shell, Command } = require('winrm-client');
```

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

## Install

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

## TypeScript Support

This library includes full TypeScript support with type definitions for all exported functions and interfaces. The library is written in TypeScript and provides comprehensive type safety.

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

### Type Definitions

The library exports the following main types:

- `WinRMParams` - Configuration parameters for WinRM connections
- `CommandParams` - Parameters for command execution
- `SoapHeaderParams` - SOAP header configuration
- `ReplSessionParams` - Configuration for REPL sessions
- `ReplSessionState` - Internal session state tracking
- `ReplCommandResult` - Enhanced command result with session info

### REPL-Style Sessions

The `WinRMRepl` class provides persistent shell sessions that maintain state between commands:

```javascript
const { WinRMRepl } = require('winrm-client');

const repl = new WinRMRepl({
  host: '192.168.1.100',
  username: 'Administrator',
  password: 'your-password',
  port: 5985,
});

await repl.start();

// Commands maintain session state
await repl.executeCommand('cd C:\\');
const result = await repl.executeCommand('dir');
console.log(result.output);

// PowerShell commands
const psResult = await repl.executePowershell('Get-Date');
console.log(psResult.output);

// Clean up
await repl.close();
```

Benefits of REPL sessions:

- **State Persistence**: Working directory, environment variables, and session context are maintained
- **Performance**: Reuses shell connection instead of creating new ones for each command
- **Interactive**: Suitable for interactive command sequences and workflows
- **Error Recovery**: Built-in session management and reconnection capabilities

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

### Run multiple Commands (Advanced)

```javascript
const winrm = require('winrm-client');

const userName = 'userName';
const password = 'password';
const host = '10.xxx.xxx.xxx';
const port = 5985;

const auth =
  'Basic ' + Buffer.from(userName + ':' + password, 'utf8').toString('base64');
const params = {
  host,
  port,
  path: '/wsman',
};
params['auth'] = auth;

//Get the Shell ID
params['shellId'] = await winrm.shell.doCreateShell(params);

// Execute Command1
params['command'] = 'ipconfig /all';
params['commandId'] = await winrm.command.doExecuteCommand(params);
const result1 = await winrm.command.doReceiveOutput(params);

// Execute Command2
params['command'] = 'mkdir D:\\winrmtest001';
params['commandId'] = await winrm.command.doExecuteCommand(params);
const result2 = await winrm.command.doReceiveOutput(params);

// Close the Shell
await winrm.shell.doDeleteShell(params);
```

## Testing

`npm test`

## Maintainers

- Sebastien Hideux (https://github.com/shide1989)

## Credits

- https://github.com/jacobludriks/winrmjs
