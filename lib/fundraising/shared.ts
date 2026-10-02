/**
 * Client-safe fundraising kit labels.
 *
 * The asset type labels and blurbs are needed by the fundraising kit UI, but
 * they used to live in `lib/ai/fundraising-assets`, which imports the OpenAI
 * Agents SDK. A client component importing from there pulls the agent runtime
 * into the browser bundle and the production build fails. This leaf module has
 * no imports beyond the shared asset type, so it is safe on either side.
 *
 * `lib/ai/fundraising-assets` re-exports these for its server callers.
 */

import type { AssetType } from "@/lib/schemas/content";

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  ONE_PAGER: "One-Pager",
  EXECUTIVE_SUMMARY: "Executive Summary",
  COLD_EMAIL: "Investor Cold Email",
  ELEVATOR_PITCH: "Elevator Pitch",
  MEETING_SCRIPT: "Investor Meeting Script",
  LANDING_PAGE: "Landing Page Copy",
};

/** One-line purpose shown next to the type in the generator UI. */
export const ASSET_TYPE_BLURBS: Record<AssetType, string> = {
  ONE_PAGER: "The single page an investor forwards to a colleague.",
  EXECUTIVE_SUMMARY: "A partner-ready memo that stands alone in an inbox.",
  COLD_EMAIL: "Short, specific, and easy to reply to.",
  ELEVATOR_PITCH: "Thirty seconds, spoken out loud.",
  MEETING_SCRIPT: "A timed, spoken-word run of the meeting.",
  LANDING_PAGE: "The page a stranger lands on after the meeting.",
};
