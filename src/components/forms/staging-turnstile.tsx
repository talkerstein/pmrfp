"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { stagingTurnstileAction } from "@/lib/d1/staging-turnstile";

type Turnstile = {
  render: (element: HTMLElement, options: {
    sitekey: string; action: string; size: "normal" | "compact"; callback: (token: string) => void;
    "expired-callback": () => void; "error-callback": () => void; "response-field": boolean;
  }) => string;
  remove: (id: string) => void;
};

export function StagingTurnstile({ siteKey, attempt, onToken }: {
  siteKey: string;
  attempt: object;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onToken("");
    const turnstile = (window as Window & { turnstile?: Turnstile }).turnstile;
    if (!ready || !turnstile || !container.current) return;
    const widget = turnstile.render(container.current, {
      sitekey: siteKey,
      action: stagingTurnstileAction,
      size: container.current.clientWidth < 300 ? "compact" : "normal",
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
      "response-field": false,
    });
    return () => turnstile.remove(widget);
  }, [ready, siteKey, attempt, onToken]);

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={container} />
    </>
  );
}
