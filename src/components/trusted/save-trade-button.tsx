"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleTrustedTradeAction, trustedStateAction } from "@/lib/trusted/actions";

/**
 * "Save to my trusted trades" on a directory profile. The profile page is
 * statically cached, so who's looking is resolved here after load: realtors
 * and property managers get the toggle, signed-out visitors a sign-up nudge,
 * trades nothing.
 */
export function SaveTradeButton({ organizationId, slug, name }: { organizationId: string; slug: string; name: string }) {
  const [state, setState] = useState<{ viewer: "owner" | "anon" | "other"; saved: boolean } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    trustedStateAction(organizationId)
      .then((s) => live && setState(s))
      .catch(() => live && setState({ viewer: "anon", saved: false }));
    return () => {
      live = false;
    };
  }, [organizationId]);

  if (!state || state.viewer === "other") return null;

  if (state.viewer === "anon") {
    const next = encodeURIComponent(`/directory/${slug}`);
    return (
      <p className="mb-4 rounded-lg border border-dashed border-teal-300 bg-teal-50/50 px-3 py-2.5 text-center text-xs leading-relaxed text-muted-foreground">
        Realtor?{" "}
        <Link href={`/sign-up?role=real_estate_agent&next=${next}`} className="font-semibold text-teal-700 hover:underline">
          Add {name} to your own trusted-trades page
        </Link>{" "}
        and send clients one link.
      </p>
    );
  }

  const toggle = () =>
    start(async () => {
      const res = await toggleTrustedTradeAction(organizationId);
      if (res.error) {
        if (res.limit) {
          toast.error(res.error, { action: { label: "Upgrade", onClick: () => (window.location.href = "/pm-dashboard/saved-vendors") } });
        } else toast.error(res.error);
        return;
      }
      setState({ viewer: "owner", saved: Boolean(res.saved) });
      toast.success(res.saved ? `${name} is on your trusted-trades page.` : `Removed ${name} from your page.`, {
        action: res.handle ? { label: "View page", onClick: () => window.open(`/trusted/${res.handle}`, "_blank") } : undefined,
      });
    });

  return (
    <Button variant={state.saved ? "outline" : "accent"} className="mb-4 w-full" disabled={pending} onClick={toggle}>
      {state.saved ? <Check className="size-4" /> : <Plus className="size-4" />}
      {pending ? "Saving…" : state.saved ? "On your trusted trades" : "Save to my trusted trades"}
    </Button>
  );
}
