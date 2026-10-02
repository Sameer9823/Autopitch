import { prisma } from "@/lib/db";
import type { UsageEventType } from "@/lib/generated/prisma/client";

/**
 * Internal usage ledger.
 *
 * This exists so billing CAN be added later without a data migration, but it
 * is deliberately invisible in the product: there is no plan, no quota, no
 * limit, no upgrade screen, and no user-facing readout anywhere. Every call is
 * fire-and-forget — telemetry must never fail a user's request.
 */

type TrackInput = {
  type: UsageEventType;
  userId?: string | null;
  workspaceId?: string | null;
  deckId?: string | null;
  quantity?: number;
  bytes?: number;
  meta?: Record<string, string | number | boolean | null>;
};

export function trackUsage(input: TrackInput): void {
  const {
    type,
    userId,
    workspaceId,
    deckId,
    quantity = 1,
    bytes = 0,
    meta = {},
  } = input;

  void prisma.usageEvent
    .create({
      data: {
        type,
        userId: userId ?? null,
        workspaceId: workspaceId ?? null,
        deckId: deckId ?? null,
        quantity,
        bytes,
        meta,
      },
    })
    .catch((error: unknown) => {
      console.error("[usage] failed to record event", type, error);
    });
}

/** Fire-and-forget helper for use inside Inngest steps (no request user ctx). */
export function trackUsageSafe(input: TrackInput): void {
  try {
    trackUsage(input);
  } catch (error) {
    console.error("[usage] failed to record event", input.type, error);
  }
}
