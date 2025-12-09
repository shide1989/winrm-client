declare module 'js-md4' {
  interface Md4 {
    update(data: string | ArrayBuffer | Uint8Array | Buffer): Md4;
    hex(): string;
    arrayBuffer(): ArrayBuffer;
  }

  function create(): Md4;
  export default { create };
}
