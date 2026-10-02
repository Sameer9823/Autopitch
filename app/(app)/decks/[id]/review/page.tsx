import { notFound } from "next/navigation";

import { ReviewRunner, type ReviewSummary } from "@/components/review/review-runner";
import { requireDeck, requireUser } from "@/lib/api/guards";
import { parseStoredReview } from "@/lib/ai/investor-review";
import { toRenderModel } from "@/lib/deck/to-render-model";
import { prisma } from "@/lib/db";

/**
 * Investor Review.
 *
 * A server component: it verifies the session, proves the deck belongs to the
 * caller (404 for anything else, so a deck id is never confirmed by its
 * response), and loads the latest review plus the recent run history.
 *
 * The stored payload is re-validated through `PitchReviewSchema` before it is
 * handed to the client. An unvalidated JSON column is never rendered, and a
 * review whose payload cannot be read shows the "never reviewed" state with the
 * option to re-run rather than a half-rendered page.
 */

export const metadata = { title: "Investor Review" };

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 20;

export default async function ReviewPage({ params }: PageProps<"/decks/[id]/review">) {
  const user = await requireUser();
  const { id } = await params;

  const deck = await requireDeck(id, user.id).catch(() => null);

  if (!deck) {
    notFound();
  }

  // The same conversion the editor, the share viewer and both exporters use, so
  // the slide thumbnails inside a review show the deck exactly as it presents.
  const brandKit = await prisma.brandKit.findFirst({
    where: { OR: [{ userId: user.id }, { workspaceId: user.workspaceId }] },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const renderModel = toRenderModel(deck, brandKit);

  const [latest, history] = await Promise.all([
    prisma.pitchReview.findFirst({
      where: { deckId: deck.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pitchReview.findMany({
      where: { deckId: deck.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        status: true,
        overallScore: true,
        createdAt: true,
      },
    }),
  ]);

  const payload = parseStoredReview(latest?.payload);

  const historyRows: ReviewSummary[] = history.map((entry) => ({
    id: entry.id,
    status: entry.status,
    overallScore: entry.overallScore,
    createdAt: entry.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Investor Review
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Your deck read the way a partner reads it — all {deck.slides.length}{" "}
          slides, as a fundraising document for{" "}
          {deck.startupName ?? deck.title ?? "this company"}. The score is only a
          summary; the reasoning underneath it is the deliverable.
        </p>
      </header>

      <ReviewRunner
        deckId={deck.id}
        slides={renderModel.slides}
        theme={renderModel.theme ?? null}
        initialReview={
          latest
            ? {
                id: latest.id,
                status: latest.status,
                overallScore: latest.overallScore,
                createdAt: latest.createdAt.toISOString(),
                errorMessage: latest.errorMessage,
                payload,
              }
            : null
        }
        initialHistory={historyRows}
      />
    </div>
  );
}
