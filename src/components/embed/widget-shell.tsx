import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_LIMIT, type WidgetKind } from "@/lib/embed/widgets";

/**
 * Runs inline, before paint (and before hydration), inside the widget iframe.
 * It edits attributes React rendered, so those elements carry
 * suppressHydrationWarning:
 * - applies the display options from the URL hash (theme class; item limit as a stylesheet),
 * - tags outbound links with the host site as utm_content,
 * - reports the widget's height to the embedding page (public/embed.js).
 * Plain ES5 on purpose: it runs on whatever browser the host site's visitors use.
 */
const RUNTIME = `(function(){
var root=document.getElementById("pmrfp-w");if(!root)return;
var h={};location.hash.replace(/^#/,"").split("&").forEach(function(p){var kv=p.split("=");if(kv[0])h[kv[0]]=decodeURIComponent(kv[1]||"")});
if(h.theme==="dark")root.classList.add("dark");
var lim=parseInt(h.limit,10);if(!(lim>0))lim=parseInt(root.getAttribute("data-default-limit"),10)||0;
if(lim>0){var st=document.createElement("style");st.textContent="#pmrfp-w>a[data-item]:nth-of-type(n+"+(lim+1)+"){display:none}";document.head.appendChild(st);}
var host="";try{host=document.referrer?new URL(document.referrer).hostname:""}catch(e){}
if(host){var links=root.querySelectorAll("a[href]");for(var j=0;j<links.length;j++){try{var u=new URL(links[j].href);u.searchParams.set("utm_content",host);links[j].href=u.toString()}catch(e){}}}
function post(){try{parent.postMessage({type:"pmrfp:height",height:Math.ceil(root.getBoundingClientRect().height)+2},"*")}catch(e){}}
if(window.ResizeObserver)new ResizeObserver(post).observe(root);post();window.addEventListener("load",post);
})();`;

export function WidgetShell({
  kind,
  eyebrow,
  title,
  subtitle,
  footerLinks,
  list = true,
  media,
  children,
}: {
  kind: WidgetKind;
  /** Optional logo/avatar shown left of the title. */
  media?: React.ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string | null;
  /** Up to two outbound links under the list, first one primary. */
  footerLinks: { href: string; label: string }[];
  /** List widgets honour the hash `limit`; the company card doesn't. */
  list?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        id="pmrfp-w"
        suppressHydrationWarning
        data-kind={kind}
        data-default-limit={list ? DEFAULT_LIMIT : undefined}
        className="overflow-hidden rounded-[14px] border border-border bg-card font-sans text-card-foreground"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 pb-3 pt-4">
          {media}
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow text-[10px] text-muted-foreground">{eyebrow}</p>}
            <p className="mt-0.5 font-heading text-[15px] font-semibold leading-snug tracking-tight">{title}</p>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {children}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {footerLinks.map((l, i) => (
              <a
                key={l.href}
                suppressHydrationWarning
                href={l.href}
                target="_blank"
                rel="noopener"
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-semibold hover:underline",
                  i === 0 ? "text-accent-foreground" : "text-muted-foreground",
                )}
              >
                {l.label}
                {i === 0 && <ArrowUpRight className="size-3" />}
              </a>
            ))}
          </div>
          <PoweredBy href={footerLinks[footerLinks.length - 1]?.href ?? "https://pmrfp.com"} />
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: RUNTIME }} />
    </>
  );
}

/** Small brand mark + wordmark; the only branding a host site has to carry. */
function PoweredBy({ href }: { href: string }) {
  const home = (() => {
    try {
      const u = new URL(href);
      u.pathname = "/";
      return u.toString();
    } catch {
      return "https://pmrfp.com";
    }
  })();
  return (
    <a href={home} suppressHydrationWarning target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
      <svg viewBox="0 0 518 518" aria-hidden className="size-3.5 fill-primary">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M97 0C43.4284 0 0 43.4283 0 96.9999V420.202C0 473.773 43.4283 517.202 96.9999 517.202H420.202C473.773 517.202 517.202 473.773 517.202 420.202V97C517.202 43.4284 473.773 0 420.202 0H97ZM339.006 91.2973C318.697 79.6443 296.057 73.8178 271.086 73.8178C234.13 73.8178 205.996 85.4708 186.685 108.777V77.8131H112.273V443.384H190.181V318.031C209.825 339.672 236.793 350.493 271.086 350.493C296.057 350.493 318.697 344.833 339.006 333.513C359.649 321.86 375.797 305.712 387.45 285.07C399.103 264.094 404.929 239.79 404.929 212.155C404.929 184.521 399.103 160.383 387.45 139.74C375.797 118.765 359.649 102.617 339.006 91.2973ZM306.545 266.591C293.893 279.909 277.579 286.568 257.602 286.568C237.625 286.568 221.145 279.909 208.16 266.591C195.508 252.941 189.182 234.795 189.182 212.155C189.182 189.515 195.508 171.536 208.16 158.219C221.145 144.568 237.625 137.743 257.602 137.743C277.579 137.743 293.893 144.568 306.545 158.219C319.529 171.536 326.022 189.515 326.022 212.155C326.022 234.795 319.529 252.941 306.545 266.591Z"
        />
      </svg>
      Powered by <span className="font-semibold text-foreground">PMRFP</span>
    </a>
  );
}

/** One row in a list widget. `data-item` lets the runtime apply the limit; `urgent` shows bold after the meta. */
export function WidgetRow({
  href,
  title,
  meta,
  badge,
  urgent,
}: {
  href: string;
  title: string;
  meta: string;
  badge?: string | null;
  urgent?: string | null;
}) {
  return (
    <a
      data-item
      suppressHydrationWarning
      href={href}
      target="_blank"
      rel="noopener"
      className="group block border-b border-border px-4 py-3 last:border-b-0 hover:bg-secondary/60"
    >
      <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">{title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {badge && (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">{badge}</span>
        )}
        <span>{meta}</span>
        {urgent && <span className="font-semibold text-accent-foreground">{urgent}</span>}
      </p>
    </a>
  );
}

/** Company logo, or its initials on a brand tile when there's none. */
export function WidgetLogo({ src, name }: { src: string | null; name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={44} height={44} className="size-11 shrink-0 rounded-lg border border-border bg-white object-contain p-1" />
  ) : (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary font-heading text-sm font-semibold text-primary-foreground">
      {initials}
    </span>
  );
}

export function WidgetEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

/** Shown in the frame when a widget's company, list or filter no longer exists. */
export function WidgetUnavailable({ href }: { href: string }) {
  return (
    <WidgetShell kind="feed" title="This widget isn't available" footerLinks={[{ href, label: "Open PMRFP" }]} list={false}>
      <WidgetEmpty>The listing behind this widget was moved or unpublished.</WidgetEmpty>
    </WidgetShell>
  );
}

/** "Closes Oct 14" in the viewer-agnostic UTC day the deadline was stored as. */
export function closesOn(deadline: string | null): string {
  if (!deadline) return "Open until filled";
  const d = new Date(`${deadline.slice(0, 10)}T12:00:00Z`);
  return `Closes ${d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}
