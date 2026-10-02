import { HugeiconsIcon } from "@hugeicons/react";

import { StatePanel } from "@/components/dashboard/state-panels";
import { Task01Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTemplateAction } from "@/app/actions/templates";
import { requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

export const metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

/**
 * Pitch deck templates.
 *
 * A template gives a founder the right slide sequence — it does not write their
 * story. Choosing one opens the editor with the outline in place, so the deck is
 * still built from their own material.
 *
 * Public templates plus this workspace's own are visible; anything else resolves
 * to the same empty gallery as a template that does not exist.
 */
export default async function TemplatesPage() {
  const user = await requireUser();

  const templates = await prisma.deckTemplate.findMany({
    where: {
      OR: [{ isPublic: true }, { workspaceId: user.workspaceId }],
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      thumbnailUrl: true,
      isPublic: true,
      slideLayout: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Templates
        </h1>
        <p className="text-sm text-muted-foreground">
          Start from the right slide sequence. Every slide still gets written
          from your own material.
        </p>
      </header>

      {templates.length === 0 ? (
        <div className="mt-6">
          <StatePanel
            kind="empty"
            title="No templates yet"
            description="Templates are slide outlines. Build a deck from scratch and save the structure here to reuse it."
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4"
            >
              <div className="aspect-video overflow-hidden rounded border border-border bg-surface-2">
                {template.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={template.thumbnailUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="grid size-full place-items-center text-subtle-foreground">
                    <HugeiconsIcon
                      icon={Task01Icon}
                      className="size-8"
                      aria-hidden
                    />
                  </div>
                )}
              </div>

              <div className="flex-1">
                <h2 className="font-heading font-semibold">{template.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {template.description ??
                    `${slideCount(template.slideLayout)}-slide outline`}
                </p>
              </div>

              <form action={useTemplateAction} className="flex flex-col gap-3">
                <input type="hidden" name="templateId" value={template.id} />

                <div className="flex flex-col gap-2">
                  <Label htmlFor={`deck-title-${template.id}`} className="sr-only">
                    Deck name
                  </Label>
                  <Input
                    id={`deck-title-${template.id}`}
                    name="title"
                    placeholder={`${template.name} deck`}
                    maxLength={120}
                  />
                </div>

                <Button type="submit" size="sm">
                  Use this template
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Slide count for the fallback description, tolerant of a malformed layout. */
function slideCount(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}
