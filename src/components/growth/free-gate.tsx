import { getLang, getT } from "@/i18n/server";
import { localizePath } from "@/i18n/config";

/**
 * "Free account: see the rest" panel, shown to signed-out visitors where the
 * gated details would be. The details themselves are not in the page.
 * Sign-up and sign-in come back to this page.
 */
export function FreeGate({ kind, path }: { kind: "project" | "benchmark"; path: string }) {
  const lang = getLang();
  const t = getT("growth").gate;
  const back = encodeURIComponent(localizePath(path, lang));
  return (
    <div className="g-cta" data-panel="free-gate">
      <h3 className="hd">{kind === "project" ? t.mpTitle : t.bmTitle}</h3>
      <p>{kind === "project" ? t.mpBody : t.bmBody}</p>
      <div className="acts">
        <a href={`${localizePath("/sign-up", lang)}?next=${back}`} className="btn mint lg">{t.signUp}</a>
        <a href={`${localizePath("/sign-in", lang)}?next=${back}`} className="lnk">{t.signIn} →</a>
      </div>
      <p className="small muted">{t.note}</p>
    </div>
  );
}
