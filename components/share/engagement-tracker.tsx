"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Privacy-conscious engagement tracker for the public share viewer.
 *
 * Sends:
 *   - a "view-open" ping on mount,
 *   - a "slide" event per slide with dwell time (only when the slide order
 *     actually changes),
 *   - a "final" event on unload with total duration, max slide reached, and
 *     whether the deck was completed.
 *
 * The client generates a random per-session client id in the browser and sends
 * it with every ping. The server hashes it with a daily-rotating salt into
 * `DeckView.visitorHash` — the client id never reaches the database, and no IP,
 * user agent, or other identifier is ever transmitted.
 *
 * Tracking failures never block or degrade the viewer: every send is
 * fire-and-forget, and `sendBeacon` is used on unload so the final ping is
 * most likely to land even as the tab closes.
 */

/** A random, non-identifying per-session key. */
function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts, where `randomUUID` is unavailable.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type TrackEvent = Record<string, unknown>;

export function EngagementTracker({
  token,
  totalSlides,
  slideOrder,
}: {
  token: string;
  totalSlides: number;
  slideOrder: number;
}) {
  // Lazy state initializer rather than a ref written during render: the id is
  // genuinely a value of this component, it just never changes afterwards.
  const [clientId] = useState(newClientId);

  const startedAtRef = useRef<number | null>(null);
  const lastSlideRef = useRef<number | null>(null);
  const lastSeenRef = useRef<number | null>(null);
  const maxSlideRef = useRef<number>(0);
  const completedRef = useRef<boolean>(false);
  const sendingRef = useRef<boolean>(false);

  const endpoint = `/api/share/${encodeURIComponent(token)}/track`;

  const send = useCallback(
    async (events: TrackEvent[], useBeacon = false): Promise<void> => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      try {
        const payload = JSON.stringify({ clientId, events });

        if (useBeacon && navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          const queued = navigator.sendBeacon(endpoint, blob);
          if (!queued) {
            await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
              keepalive: true,
            });
          }
          return;
        }

        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      } catch {
        // Tracking must never block or degrade the viewer.
      } finally {
        sendingRef.current = false;
      }
    },
    [clientId, endpoint],
  );

  // View-open ping on mount. This is also where the session clock starts, so
  // the reported duration excludes nothing and includes the whole visit.
  useEffect(() => {
    startedAtRef.current = Date.now();
    lastSeenRef.current = startedAtRef.current;
    lastSlideRef.current = slideOrder;
    void send([{ type: "view-open" }]);
    // Mount only: this effect opens the session, it does not react to slides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  // Track max slide reached and completion state.
  useEffect(() => {
    if (slideOrder > maxSlideRef.current) {
      maxSlideRef.current = slideOrder;
    }
    if (totalSlides > 0 && slideOrder >= totalSlides) {
      completedRef.current = true;
    }
  }, [slideOrder, totalSlides]);

  // Per-slide dwell ping — only when the slide order actually changes, so
  // revisiting a slide records a new dwell rather than duplicating the event.
  useEffect(() => {
    const previous = lastSlideRef.current;

    if (previous === null || previous === slideOrder) {
      lastSlideRef.current = slideOrder;
      return;
    }

    const now = Date.now();
    const dwell = lastSeenRef.current ? now - lastSeenRef.current : 0;
    lastSeenRef.current = now;
    lastSlideRef.current = slideOrder;

    void send([{ type: "slide", slideOrder: previous, dwellMs: dwell }]);
  }, [slideOrder, send]);

  // Final ping on unload. `pagehide` is the reliable one (it fires on bfcache
  // and mobile tab close); `beforeunload` is kept as a desktop fallback. The
  // `sent` guard means the two listeners can never double-report one visit.
  useEffect(() => {
    let sent = false;

    const report = () => {
      if (sent) return;
      sent = true;

      void send(
        [
          {
            type: "final",
            durationMs: startedAtRef.current
              ? Date.now() - startedAtRef.current
              : 0,
            maxSlideOrder: maxSlideRef.current,
            completed: completedRef.current,
          },
        ],
        true,
      );
    };

    window.addEventListener("pagehide", report);
    window.addEventListener("beforeunload", report);

    return () => {
      window.removeEventListener("pagehide", report);
      window.removeEventListener("beforeunload", report);
    };
  }, [send]);

  return null;
}
