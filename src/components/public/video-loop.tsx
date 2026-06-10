"use client";

/**
 * Ambient background video loop with safe fallbacks.
 *
 * Renders the static poster image immediately (SSR-safe, no CLS). The <video>
 * mounts only on the client when the viewport is desktop-sized AND the user
 * has not requested reduced motion — phones and reduced-motion users keep the
 * static image. Video is muted/looped/inline and lazy (preload="none"),
 * so it never competes with LCP content.
 */
import { useEffect, useState } from "react";

export function VideoLoop({
  src,
  poster,
  alt,
  className = "absolute inset-0 size-full object-cover",
}: {
  /** MP4/WebM source path (e.g. /video/audience-pm.mp4). */
  src: string;
  /** Static image shown immediately and used as the video poster. */
  poster: string;
  alt: string;
  className?: string;
}) {
  const [playVideo, setPlayVideo] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const update = () => setPlayVideo(desktop.matches && motionOk.matches);
    update();
    desktop.addEventListener("change", update);
    motionOk.addEventListener("change", update);
    return () => {
      desktop.removeEventListener("change", update);
      motionOk.removeEventListener("change", update);
    };
  }, []);

  if (!playVideo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt={alt} loading="lazy" className={className} />;
  }

  return (
    <video
      src={src}
      poster={poster}
      muted
      autoPlay
      loop
      playsInline
      preload="none"
      aria-label={alt}
      className={className}
    />
  );
}
