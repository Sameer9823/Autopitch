"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

/**
 * Start a deck from a template.
 *
 * A template is a slide outline, not a finished deck: the layout is copied into
 * a new deck so the founder still generates and writes every slide. The template
 * is validated against the slide schema before anything is written, because
 * `slideLayout` is a free-form Json column and one malformed template must not
 * be able to produce a deck the editor cannot open.
 */

const TEMPLATE_ID = z.string().cuid();

/** How much of the template becomes a real slide row. */
const MAX_SLIDES = 40;

export async function useTemplateAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const parsed = TEMPLATE_ID.safeParse(String(formData.get("templateId") ?? ""));
  if (!parsed.success) {
    redirect("/templates");
  }

  // A template is either public or belongs to this user's own workspace. An
  // unowned id is indistinguishable from one that does not exist.
  const template = await prisma.deckTemplate.findFirst({
    where: {
      id: parsed.data,
      OR: [{ isPublic: true }, { workspaceId: user.workspaceId }],
    },
  });

  if (!template) {
    redirect("/templates");
  }

  const layout = parseLayout(template.slideLayout);
  const title = String(formData.get("title") ?? "").trim() || template.name;

  const deck = await prisma.deck.create({
    data: {
      idea: `Working from the "${template.name}" template. ${
        template.description ?? ""
      }`.trim(),
      title,
      startupName: String(formData.get("startupName") ?? "").trim() || null,
      userId: user.id,
      workspaceId: user.workspaceId,
      slides: {
        create: layout.slice(0, MAX_SLIDES).map((entry, index) => ({
          order: index + 1,
          layout: entry.layout,
          title: entry.title,
          content: entry.content,
          // `Slide.imagePrompt` is non-nullable. A template supplies structure,
          // not imagery, so the prompt starts empty and the founder or the image
          // pipeline fills it in when they generate the slide.
          imagePrompt: "",
          // The slide came from a human-authored outline, so it must never be
          // silently overwritten by a regeneration.
          userEdited: true,
        })),
      },
    },
  });

  redirect(`/decks/${deck.id}/editor`);
}

/**
 * Read `slideLayout` defensively.
 *
 * Anything that is not a recognisable outline is skipped rather than rejected
 * wholesale, so one bad entry costs the founder a single slide instead of the
 * whole template.
 */
function parseLayout(
  raw: unknown,
): { layout: string; title: string; content: string }[] {
  const entries = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.values(raw as Record<string, unknown>)
      : [];

  const parsed: { layout: string; title: string; content: string }[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const layout = typeof record.layout === "string" ? record.layout : "";

    if (!layout) continue;

    parsed.push({
      layout,
      // `Slide.title` is non-nullable, so an outline entry with no title still
      // becomes a usable slide rather than failing the whole insert.
      title: typeof record.title === "string" && record.title.trim() ? record.title : "Untitled slide",
      content: typeof record.content === "string" ? record.content : "",
    });
  }

  return parsed;
}
