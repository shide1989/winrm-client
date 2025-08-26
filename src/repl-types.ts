import { WinRMParams } from './types';

export interface ReplSessionParams {
  host: string;
  username: string;
  password: string;
  port?: number;
  timeout?: number;
}

export interface ReplSessionState {
  shellId: string;
  connectionParams: WinRMParams;
  isActive: boolean;
  lastActivity: Date;
}

export interface ReplCommandResult {
  output: string;
  error?: string;
  timestamp: Date;
  executionTime: number;
}
