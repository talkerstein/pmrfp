"use client";

import { useEffect } from "react";
import { track, trackListingView, type BeaconProps } from "@/lib/tracking/client";
import type { ClientEvent } from "@/lib/tracking/events";

/** Sends one browser-side funnel event when the page opens (e.g. pricing_viewed, signup_started). */
export function TrackOnMount({ event, props }: { event: ClientEvent; props?: BeaconProps }) {
  const key = JSON.stringify(props ?? {});
  useEffect(() => {
    track(event, key === "{}" ? undefined : (JSON.parse(key) as BeaconProps));
  }, [event, key]);
  return null;
}

/** Counts a listing view (rfp_views): once per visitor per listing per day, decided on the server. */
export function TrackListingView({ slug }: { slug: string }) {
  useEffect(() => {
    trackListingView(slug);
  }, [slug]);
  return null;
}
