"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { VISITOR_UPGRADE_PATH } from "@/lib/auth/visitor-upgrade";

/**
 * The header's account link. Signed out (and for most members) it's "Sign in",
 * exactly as before. A signed-in "just looking" (visitor) account gets "List
 * your business" instead, so it can switch to a free listing any time.
 * The session is read from the local cookie; the role is one small read of
 * the member's own profile row, only when someone is signed in.
 */
export function V3AccountLink({ L, signIn, listBusiness }: { L: (p: string) => string; signIn: { href: string; label: string }; listBusiness: string }) {
  const [visitor, setVisitor] = useState(false);
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let live = true;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getSession();
        const id = data.session?.user.id;
        if (!id) return;
        const { data: row } = await sb.from("users_profile").select("primary_role").eq("id", id).maybeSingle<{ primary_role: string }>();
        if (live && row?.primary_role === "visitor") setVisitor(true);
      } catch {
        /* the plain "Sign in" link stays */
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return visitor ? <a href={L(VISITOR_UPGRADE_PATH)}>{listBusiness}</a> : <a href={L(signIn.href)}>{signIn.label}</a>;
}
