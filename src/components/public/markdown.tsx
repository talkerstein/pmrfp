import React from "react";

/** Minimal, dependency-free Markdown renderer for resource articles. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2]) nodes.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>);
    else if (m[3] && m[4])
      nodes.push(
        <a key={`${keyBase}-a${i}`} href={m[4]} className="text-gold-700 underline">
          {m[3]}
        </a>,
      );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length) {
      const items = [...list];
      blocks.push(
        <ul key={`ul${key++}`} className="my-4 list-disc space-y-1.5 pl-5 text-foreground/90">
          {items.map((it, idx) => (
            <li key={idx}>{inline(it, `li${key}-${idx}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("### ")) {
      flushList();
      blocks.push(<h3 key={`h3${key++}`} className="mt-6 text-lg font-semibold">{inline(line.slice(4), `h3${key}`)}</h3>);
    } else if (line.startsWith("## ")) {
      flushList();
      blocks.push(<h2 key={`h2${key++}`} className="mt-8 text-2xl font-semibold tracking-tight">{inline(line.slice(3), `h2${key}`)}</h2>);
    } else if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(<p key={`p${key++}`} className="mt-4 leading-relaxed text-foreground/90">{inline(line, `p${key}`)}</p>);
    }
  }
  flushList();
  return <div>{blocks}</div>;
}
