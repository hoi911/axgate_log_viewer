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
  openRecent: (dir: string) => Promise<{
    dir?: string;
    files?: { name: string; path: string; bytes: Uint8Array }[];
    missing?: boolean;
  } | null>;
  listRecent: () => Promise<{ dir: string; name: string; lastOpened: number; fileCount?: number }[]>;
  onOpenFiles: (
    handler: (files: { name: string; path: string; bytes: Uint8Array }[]) => void,
  ) => () => void;
  rendererReady: () => Promise<boolean>;
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
