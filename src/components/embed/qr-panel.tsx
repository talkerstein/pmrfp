"use client";

import { useMemo } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { qrEncode, qrSvg, type QrMatrix } from "@/lib/embed/qr";

export interface QrPanelStrings {
  title: string;
  body: string;
  caption: string;
  svg: string;
  png: string;
  print: string;
}

const FILE = "pmrfp-repair-quotes-qr";
/** Pixels per module in the PNG (a 4-module quiet zone each side). */
const PNG_SCALE = 12;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toPng(qr: QrMatrix) {
  const border = 4;
  const dim = (qr.size + border * 2) * PNG_SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) ctx.fillRect((x + border) * PNG_SCALE, (y + border) * PNG_SCALE, PNG_SCALE, PNG_SCALE);
  }
  canvas.toBlob((blob) => blob && download(blob, `${FILE}.png`), "image/png");
}

/**
 * The printable QR code for the report-quotes widget, drawn in the browser
 * by the in-repo encoder (src/lib/embed/qr.ts, no library). Download as SVG
 * or PNG, or print it with its caption.
 */
export function QrPanel({ link, s }: { link: string; s: QrPanelStrings }) {
  const qr = useMemo(() => qrEncode(link), [link]);
  const svg = useMemo(() => (qr ? qrSvg(qr, { title: s.caption }) : null), [qr, s.caption]);
  if (!qr || !svg) return null;

  function print() {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) return frame.remove();
    const caption = s.caption.replace(/[<>&]/g, "");
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${caption}</title><style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:system-ui,sans-serif}figure{margin:0;text-align:center}svg{width:6cm;height:6cm}figcaption{margin-top:8px;font-size:12pt}</style></head><body><figure>${svg}<figcaption>${caption}</figcaption></figure></body></html>`,
    );
    doc.close();
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{s.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <figure className="w-36 shrink-0 text-center">
          {/* Our own SVG, built from the encoder's module grid. */}
          <div className="rounded-md border border-border bg-white" dangerouslySetInnerHTML={{ __html: svg }} />
          <figcaption className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{s.caption}</figcaption>
        </figure>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => download(new Blob([svg], { type: "image/svg+xml" }), `${FILE}.svg`)}>
            <Download className="size-3.5" /> {s.svg}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => toPng(qr)}>
            <Download className="size-3.5" /> {s.png}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={print}>
            <Printer className="size-3.5" /> {s.print}
          </Button>
        </div>
      </div>
      <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">{link}</p>
    </div>
  );
}
