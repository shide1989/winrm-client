import { doCreateShell, doDeleteShell } from './shell';
import {
  doExecuteCommand,
  doExecutePowershell,
  doReceiveOutput,
} from './command';
import {
  ReplSessionParams,
  ReplSessionState,
  ReplCommandResult,
} from './repl-types';
import { WinRMParams } from './types';

export class WinRMRepl {
  private sessionState: ReplSessionState | null = null;
  private params: ReplSessionParams;
  private readonly defaultTimeout: number = 60000; // 60 seconds

  constructor(params: ReplSessionParams) {
    this.params = {
      port: 5985,
      timeout: this.defaultTimeout,
      ...params,
    };
  }

  async start(): Promise<void> {
    if (this.sessionState?.isActive) {
      throw new Error('REPL session is already active');
    }

    const auth =
      'Basic ' +
      Buffer.from(
        this.params.username + ':' + this.params.password,
        'utf8'
      ).toString('base64');

    const connectionParams: WinRMParams = {
      host: this.params.host,
      port: this.params.port!,
      path: '/wsman',
      auth,
    };

    try {
      const shellId = await doCreateShell(connectionParams);

      this.sessionState = {
        shellId,
        connectionParams: { ...connectionParams, shellId },
        isActive: true,
        lastActivity: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to start REPL session: ${error}`);
    }
  }

  async executeCommand(command: string): Promise<ReplCommandResult> {
    if (!this.isActive()) {
      throw new Error('REPL session is not active. Call start() first.');
    }

    const startTime = Date.now();

    try {
      const commandParams = {
        ...this.sessionState!.connectionParams,
        command,
      };

      const commandId = await doExecuteCommand(commandParams);
      const receiveParams = { ...commandParams, commandId };
      const output = await doReceiveOutput(receiveParams);

      this.sessionState!.lastActivity = new Date();

      return {
        output,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        output: '',
        error: errorMessage,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
      };
    }
  }

  async executePowershell(command: string): Promise<ReplCommandResult> {
    if (!this.isActive()) {
      throw new Error('REPL session is not active. Call start() first.');
    }

    const startTime = Date.now();

    try {
      const commandParams = {
        ...this.sessionState!.connectionParams,
        command,
      };

      const commandId = await doExecutePowershell(commandParams);
      const receiveParams = { ...commandParams, commandId };
      const output = await doReceiveOutput(receiveParams);

      this.sessionState!.lastActivity = new Date();

      return {
        output,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        output: '',
        error: errorMessage,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
      };
    }
  }

  isActive(): boolean {
    return this.sessionState?.isActive === true;
  }

  getSessionInfo(): ReplSessionState | null {
    return this.sessionState ? { ...this.sessionState } : null;
  }

  async close(): Promise<void> {
    if (!this.sessionState?.isActive) {
      return;
    }

    try {
      await doDeleteShell(this.sessionState.connectionParams);
    } catch (error) {
      console.warn('Warning: Failed to properly cleanup shell session:', error);
    } finally {
      this.sessionState.isActive = false;
      this.sessionState = null;
    }
  }

  async reconnect(): Promise<void> {
    if (this.sessionState?.isActive) {
      await this.close();
    }
    await this.start();
  }
}
