/**
 * Client contract for the brand kit API.
 *
 * Mirrors the payloads in `app/api/brand-kits/route.ts` and
 * `app/api/brand-kits/[kitId]/route.ts` so the UI cannot drift from the wire
 * format. Both routes are workspace-scoped and never accept a `workspaceId`.
 */

import type { BrandKitSuggestion } from "@/lib/schemas/content";

export type { BrandKitSuggestion };

export type BrandKit = {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  isDefault: boolean;
  workspaceId: string;
  updatedAt: string;
};

export type BrandKitListResponse = {
  kits: BrandKit[];
  activeKitId: string | null;
};

/** The fields the editor form collects, before the API's own validation. */
export type BrandKitDraft = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  isDefault: boolean;
};

/** Raise the message the API returned, never a raw fetch failure. */
export async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (body && typeof body === "object" && "error" in body) {
    const value = (body as { error: unknown }).error;
    if (typeof value === "string" && value.length > 0) return value;
  }

  return fallback;
}
