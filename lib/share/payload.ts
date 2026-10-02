import { prisma } from "@/lib/db";
import { resolveShareToken } from "@/lib/api/guards";
import { toRenderModel } from "@/lib/deck/to-render-model";

/**
 * Load the public share payload.
 *
 * Used by both the public page (`app/share/[token]/page.tsx`) and the public
 * API route (`app/api/share/[token]/route.ts`), so the whitelisting logic
 * lives in exactly one place.
 *
 * The returned payload is deliberately restricted to fields an investor
 * needs to render the deck. NEVER include: the owner's id/email/workspace id,
 * the raw `idea`, `errorMessage`, pitch score, review data, Q&A data, usage
 * data, or any internal id beyond what the viewer needs.
 */
export async function loadSharePayload(token: string) {
  const share = await resolveShareToken(token);
  const deck = share.deck;

  const brandKit = await prisma.brandKit.findFirst({
    where: { userId: deck.userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const renderModel = toRenderModel(deck, brandKit);

  return {
    share: {
      token: share.token,
      permission: share.permission,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      viewCount: share.viewCount,
    },
    deck: {
      id: renderModel.id,
      title: renderModel.title,
      startupName: renderModel.startupName,
      theme: renderModel.theme,
    },
    slides: renderModel.slides.map((slide) => ({
      id: slide.id,
      order: slide.order,
      title: slide.title,
      subtitle: slide.subtitle,
      content: slide.content,
      layout: slide.layout,
      caption: slide.caption,
      label: slide.label,
      imageUrl: slide.imageUrl,
      imageStatus: slide.imageStatus,
      blocks: slide.blocks,
    })),
  };
}

export type SharePayload = Awaited<ReturnType<typeof loadSharePayload>>;