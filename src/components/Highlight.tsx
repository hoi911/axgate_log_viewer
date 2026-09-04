export function Highlight({ text, query }: { text: string; query?: string | null }) {
  const q = query?.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: Array<{ t: string; hit: boolean; k: number }> = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const hit = lower.indexOf(needle, i);
    if (hit < 0) {
      parts.push({ t: text.slice(i), hit: false, k: k++ });
      break;
    }
    if (hit > i) parts.push({ t: text.slice(i, hit), hit: false, k: k++ });
    parts.push({ t: text.slice(hit, hit + needle.length), hit: true, k: k++ });
    i = hit + needle.length;
  }
  return (
    <>
      {parts.map((p) => (p.hit ? <mark key={p.k}>{p.t}</mark> : <span key={p.k}>{p.t}</span>))}
    </>
  );
}
