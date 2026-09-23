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
        <a key={`${keyBase}-a${i}`} href={m[4]} className="text-teal-700 underline">
          {m[3]}
        </a>,
      );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type ListKind = "ul" | "ol" | "check";

export function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let listKind: ListKind = "ul";
  // Blockquote paragraphs; a bare ">" line separates them.
  let quote: string[][] = [];
  let key = 0;

  const flushList = () => {
    if (!list.length) return;
    const items = [...list];
    const k = key++;
    if (listKind === "ol") {
      blocks.push(
        <ol key={`ol${k}`} className="my-4 list-decimal space-y-1.5 pl-5 text-foreground/90">
          {items.map((it, idx) => <li key={idx}>{inline(it, `li${k}-${idx}`)}</li>)}
        </ol>,
      );
    } else if (listKind === "check") {
      blocks.push(
        <ul key={`ck${k}`} className="my-4 space-y-2 text-foreground/90">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-3">
              <span aria-hidden className="mt-1 size-4 shrink-0 rounded border border-teal-400" />
              <span>{inline(it, `ck${k}-${idx}`)}</span>
            </li>
          ))}
        </ul>,
      );
    } else {
      blocks.push(
        <ul key={`ul${k}`} className="my-4 list-disc space-y-1.5 pl-5 text-foreground/90">
          {items.map((it, idx) => <li key={idx}>{inline(it, `li${k}-${idx}`)}</li>)}
        </ul>,
      );
    }
    list = [];
  };

  const flushQuote = () => {
    const paras = quote.filter((p) => p.length);
    if (paras.length) {
      const k = key++;
      blocks.push(
        <blockquote key={`q${k}`} className="my-5 space-y-2 border-l-4 border-teal-400 bg-card py-3 pl-4 pr-3 text-sm leading-relaxed text-foreground/90">
          {paras.map((p, idx) => <p key={idx}>{inline(p.join(" "), `q${k}-${idx}`)}</p>)}
        </blockquote>,
      );
    }
    quote = [];
  };

  const addItem = (kind: ListKind, text: string) => {
    flushQuote();
    if (list.length && listKind !== kind) flushList();
    listKind = kind;
    list.push(text);
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (line === ">" || line.startsWith("> ")) {
      flushList();
      if (!quote.length) quote.push([]);
      if (line === ">") quote.push([]);
      else quote[quote.length - 1].push(line.slice(2));
    } else if (line.startsWith("### ")) {
      flushList();
      flushQuote();
      blocks.push(<h3 key={`h3${key++}`} className="mt-6 text-lg font-semibold">{inline(line.slice(4), `h3${key}`)}</h3>);
    } else if (line.startsWith("## ")) {
      flushList();
      flushQuote();
      blocks.push(<h2 key={`h2${key++}`} className="mt-8 text-2xl font-semibold tracking-tight">{inline(line.slice(3), `h2${key}`)}</h2>);
    } else if (line.startsWith("- [ ] ")) {
      addItem("check", line.slice(6));
    } else if (line.startsWith("- ")) {
      addItem("ul", line.slice(2));
    } else if (ordered) {
      addItem("ol", ordered[1]);
    } else if (line.trim() === "") {
      flushList();
      flushQuote();
    } else {
      flushList();
      flushQuote();
      blocks.push(<p key={`p${key++}`} className="mt-4 leading-relaxed text-foreground/90">{inline(line, `p${key}`)}</p>);
    }
  }
  flushList();
  flushQuote();
  return <div>{blocks}</div>;
}
