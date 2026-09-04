import { isSupportedLogFile } from "./classify";
import type { OpenedFile } from "./types";

export function skipName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith(".")) return true;
  if (lower.endsWith(".adb-wal") || lower.endsWith(".adb-shm")) return true;
  if (lower.endsWith("-wal") || lower.endsWith("-shm")) return true;
  return !isSupportedLogFile(name);
}

export async function openedFileFromBrowserFile(file: File): Promise<OpenedFile | null> {
  if (skipName(file.name)) return null;
  const buf = await file.arrayBuffer();
  const path = "path" in file && typeof (file as File & { path?: string }).path === "string"
    ? (file as File & { path?: string }).path
    : undefined;
  return { name: file.name, path, bytes: new Uint8Array(buf) };
}

export async function filesFromFileList(list: FileList | File[]): Promise<OpenedFile[]> {
  const out: OpenedFile[] = [];
  for (const file of Array.from(list)) {
    const opened = await openedFileFromBrowserFile(file);
    if (opened) out.push(opened);
  }
  return out;
}

interface WebkitEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (ok: (file: File) => void, err: (e: Error) => void) => void;
  createReader: () => {
    readEntries: (
      ok: (entries: WebkitEntry[]) => void,
      err: (e: Error) => void,
    ) => void;
  };
}

async function readAllEntries(reader: ReturnType<WebkitEntry["createReader"]>): Promise<WebkitEntry[]> {
  const all: WebkitEntry[] = [];
  for (;;) {
    const batch = await new Promise<WebkitEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function walkEntry(entry: WebkitEntry, acc: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    acc.push(file);
    return;
  }
  if (entry.isDirectory) {
    const children = await readAllEntries(entry.createReader());
    for (const child of children) await walkEntry(child, acc);
  }
}

export async function filesFromDataTransfer(dt: DataTransfer): Promise<OpenedFile[]> {
  const items = dt.items;
  if (items && items.length > 0 && typeof items[0]?.webkitGetAsEntry === "function") {
    const files: File[] = [];
    const entries: WebkitEntry[] = [];
    for (const item of Array.from(items)) {
      const entry = item.webkitGetAsEntry?.() as WebkitEntry | null;
      if (entry) entries.push(entry);
    }
    if (entries.length > 0) {
      for (const entry of entries) await walkEntry(entry, files);
      return filesFromFileList(files);
    }
  }
  return filesFromFileList(dt.files);
}

export function walCompanionWarning(names: string[], current: string): string | undefined {
  const wal = `${current}-wal`;
  const found = names.find((n) => n === wal || n === current.replace(/\.adb$/i, ".adb-wal"));
  return found ? `${found}가 함께 있습니다. 메모리 로더는 WAL 미반영 로그를 놓칠 수 있습니다.` : undefined;
}
