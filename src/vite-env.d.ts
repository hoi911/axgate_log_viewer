/// <reference types="vite/client" />

declare module "*.wasm?url" {
  const src: string;
  export default src;
}

interface AxgateDesktopApi {
  isElectron: true;
  platform: string;
  openFolder: () => Promise<{
    dir: string;
    files: { name: string; path: string; bytes: Uint8Array }[];
  } | null>;
  openFiles: () => Promise<{
    name: string;
    path: string;
    bytes: Uint8Array;
  }[] | null>;
  saveFile: (opts: {
    defaultName: string;
    data: Uint8Array;
    encodingLabel: string;
  }) => Promise<string | null>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
}

interface Window {
  axgate?: AxgateDesktopApi;
}
