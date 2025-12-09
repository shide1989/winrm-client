declare module 'httpntlm' {
  export interface Options {
    url: string;
    username: string;
    password: string;
    domain?: string;
    workstation?: string;
    body?: string;
    headers?: Record<string, string>;
    timeout?: number;
  }

  export interface Response {
    statusCode?: number;
    statusMessage?: string;
    body?: string;
    headers?: Record<string, string>;
  }

  export type Callback = (err: Error | null, res?: Response) => void;

  export function post(options: Options, callback: Callback): void;
  export function get(options: Options, callback: Callback): void;
  export function put(options: Options, callback: Callback): void;
  export function patch(options: Options, callback: Callback): void;
  function del(options: Options, callback: Callback): void;
  export { del as delete };
}
