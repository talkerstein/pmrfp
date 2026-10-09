"use server";

import { z } from "zod";
import { getSession } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isProfileMember } from "./profile-viewer";

/**
 * The directory profile is a cached (ISR) page, so it can't know who's
 * looking. Owner-only bits (the "Add a project" tile) ask here after load:
 * the membership check runs on the server, against the viewer's own
 * session. Anyone else gets false and sees nothing.
 */
export async function isProfileMemberAction(organizationId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !z.uuid().safeParse(organizationId).success) return false;
  try {
    return isProfileMember(await getSession(), organizationId);
  } catch {
    return false;
  }
}
