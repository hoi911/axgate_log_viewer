import { glossaryFor } from "../lib/glossary";

export function TermLabel({ label, as = "span" }: { label: string; as?: "span" | "th" }) {
  const tip = glossaryFor(label);
  if (as === "th") {
    return (
      <th title={tip} tabIndex={tip ? 0 : undefined}>
        {label}
      </th>
    );
  }
  return (
    <span className={tip ? "term" : undefined} title={tip} tabIndex={tip ? 0 : undefined}>
      {label}
    </span>
  );
}
