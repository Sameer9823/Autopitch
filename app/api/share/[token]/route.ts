import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api/guards";
import { loadSharePayload } from "@/lib/share/payload";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Public share payload.
 *
 * UNAUTHENTICATED — anyone with the link can call this. The response is
 * explicitly whitelisted to ONLY the fields an investor needs to render the
 * deck:
 *   - deck title, startup name, brand theme
 *   - share permission (VIEW vs VIEW_DOWNLOAD)
 *   - slide title, subtitle, content, caption, label, blocks, imageUrl,
 *     imageStatus, layout, order
 *
 * NEVER exposed, even to the owner's own links via this endpoint: the owner's
 * id/email/workspace id, the raw `idea`, `errorMessage`, pitch score, review
 * data, Q&A data, usage data, or any internal id beyond what the viewer
 * needs to render.
 */
export const GET = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const { token } = await params;
    const payload = await loadSharePayload(token);
    return NextResponse.json(payload);
  },
);