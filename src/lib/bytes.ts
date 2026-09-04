export function toBytes(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (Array.isArray(input)) return Uint8Array.from(input as number[]);
  if (input && typeof input === "object" && "data" in (input as { data?: unknown })) {
    const data = (input as { data: unknown }).data;
    if (Array.isArray(data)) return Uint8Array.from(data as number[]);
    if (data instanceof Uint8Array) return data;
  }
  throw new Error("파일 바이너리를 읽지 못했습니다.");
}

export function epochToDatetimeLocal(epoch: number | null | undefined): string {
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function datetimeLocalToEpoch(value: string, end = false): number | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    end ? 59 : 0,
  );
  return Math.floor(d.getTime() / 1000);
}
