import type { Metadata } from "next";

// Widget pages live inside other people's websites. They're not pages of
// ours to rank, so keep them out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// The iframe should show the host page through its corners, and the root
// layout's full-height body would stop the widget from reporting its real size.
const FRAME_CSS = "html,body{background:transparent!important;min-height:0!important;height:auto!important}";

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{FRAME_CSS}</style>
      {children}
    </>
  );
}
