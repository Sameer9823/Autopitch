"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import {
  Alert02Icon,
  CheckIcon,
  Copy02Icon,
  RetryIcon,
  SparklesIcon,
  TrashIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSET_TYPE_BLURBS,
  ASSET_TYPE_LABELS,
} from "@/lib/fundraising/shared";
import type { AssetType } from "@/lib/schemas/content";

/** The wire shape of one asset, as `app/api/decks/[id]/assets` returns it. */
export type FundraisingAssetView = {
  id: string;
  deckId: string | null;
  type: string;
  typeLabel: string;
  title: string;
  content: string;
  hasGaps: boolean;
  source: "deck" | "workspace";
  createdAt: string;
  updatedAt: string;
};

const ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS) as AssetType[];

type GenerationState = "idle" | "generating" | "error";

/**
 * The fundraising kit for one deck.
 *
 * Every document here is written from the deck the founder already built, so the
 * UI never asks them to re-enter company facts. Generation is one type per
 * request on purpose: a failure is contained to the one document it belongs to
 * instead of emptying the whole kit.
 */
export function FundraisingKit({
  deckId,
  initialAssets,
}: {
  deckId: string;
  initialAssets: FundraisingAssetView[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [states, setStates] = useState<Record<string, GenerationState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setState(type: string, value: GenerationState) {
    setStates((current) => ({ ...current, [type]: value }));
  }

  function setError(type: string, message: string | null) {
    setErrors((current) => {
      if (message === null) {
        const rest = { ...current };
        delete rest[type];
        return rest;
      }
      return { ...current, [type]: message };
    });
  }

  function upsert(asset: FundraisingAssetView) {
    setAssets((current) => {
      const index = current.findIndex((row) => row.type === asset.type);
      if (index === -1) {
        return [...current, asset].sort((a, b) => a.type.localeCompare(b.type));
      }
      const next = [...current];
      next[index] = asset;
      return next;
    });
  }

  async function generate(type: AssetType) {
    setState(type, "generating");
    setError(type, null);

    try {
      const response = await fetch(`/api/decks/${deckId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (!response.ok) {
        setState(type, "error");
        setError(type, await readError(response, "Couldn't generate that document."));
        return;
      }

      const data = (await response.json()) as { asset: FundraisingAssetView };
      upsert(data.asset);
      setState(type, "idle");
    } catch {
      setState(type, "error");
      setError(type, "We couldn't reach the server. Please try again.");
    }
  }

  const byType = new Map(assets.map((asset) => [asset.type, asset]));

  return (
    <div className="flex flex-col gap-4">
      {ASSET_TYPES.map((type) => {
        const asset = byType.get(type);
        const state = states[type] ?? "idle";
        const error = errors[type];

        return (
          <section
            key={type}
            id={`asset-${type}`}
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-heading text-base font-semibold">
                  {ASSET_TYPE_LABELS[type]}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {ASSET_TYPE_BLURBS[type]}
                </p>
              </div>

              <Button
                variant={asset ? "outline" : "default"}
                size="sm"
                disabled={state === "generating"}
                onClick={() => void generate(type)}
              >
                <HugeiconsIcon
                  icon={state === "generating" ? RetryIcon : SparklesIcon}
                  className={state === "generating" ? "animate-spin" : undefined}
                  aria-hidden
                />
                {state === "generating"
                  ? "Writing…"
                  : asset
                    ? "Regenerate"
                    : "Generate"}
              </Button>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {asset ? (
              <AssetEditor
                key={asset.id}
                deckId={deckId}
                asset={asset}
                onSaved={upsert}
                onDeleted={() =>
                  setAssets((current) => current.filter((row) => row.id !== asset.id))
                }
              />
            ) : state === "generating" ? (
              <p className="text-sm text-subtle-foreground">
                Writing this from your deck. This usually takes a few seconds.
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/**
 * One generated document: view it, edit it, copy it, or throw it away.
 *
 * Edits are explicit and saved on demand rather than debounced, because these
 * documents are short and a founder pasting in a real number should be able to
 * confirm the save rather than wonder whether it landed.
 */
function AssetEditor({
  deckId,
  asset,
  onSaved,
  onDeleted,
}: {
  deckId: string;
  asset: FundraisingAssetView;
  onSaved: (asset: FundraisingAssetView) => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(asset.title);
  const [content, setContent] = useState(asset.content);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = title !== asset.title || content !== asset.content;

  async function save() {
    setStatus("idle");
    setError(null);

    try {
      const response = await fetch(`/api/decks/${deckId}/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });

      if (!response.ok) {
        setStatus("error");
        setError(await readError(response, "Couldn't save that document."));
        return;
      }

      const data = (await response.json()) as { asset: FundraisingAssetView };
      onSaved(data.asset);
      setEditing(false);
      setStatus("saved");
    } catch {
      setStatus("error");
      setError("We couldn't reach the server to save that document.");
    }
  }

  async function remove() {
    setError(null);

    try {
      const response = await fetch(`/api/decks/${deckId}/assets/${asset.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError(await readError(response, "Couldn't delete that document."));
        return;
      }

      onDeleted();
      setConfirmDelete(false);
    } catch {
      setError("We couldn't reach the server to delete that document.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${title}\n\n${content}`,
      );
      setStatus("saved");
    } catch {
      setError("Your browser blocked clipboard access. Select the text and copy it manually.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {asset.hasGaps ? (
        <p className="flex items-start gap-2 rounded border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={Alert02Icon}
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden
          />
          Your deck does not cover everything this document needs, so the AI left
          those gaps open rather than inventing them. Fill them in below.
        </p>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`title-${asset.id}`}>Title</Label>
            <Input
              id={`title-${asset.id}`}
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`content-${asset.id}`}>Document</Label>
            <Textarea
              id={`content-${asset.id}`}
              value={content}
              rows={16}
              maxLength={20000}
              onChange={(event) => setContent(event.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!dirty || !title.trim() || !content.trim()}
              onClick={() => void save()}
            >
              <HugeiconsIcon icon={CheckIcon} aria-hidden />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTitle(asset.title);
                setContent(asset.content);
                setEditing(false);
                setStatus("idle");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <article className="rounded border border-border bg-surface-2 p-4">
          <h3 className="font-medium">{asset.title}</h3>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm text-muted-foreground">
            {asset.content}
          </pre>
        </article>
      )}

      {status === "saved" && !editing ? (
        <p className="text-xs text-muted-foreground" role="status">
          Copied to your clipboard.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="xs" onClick={() => void copy()}>
            <HugeiconsIcon icon={Copy02Icon} aria-hidden />
            Copy
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <HugeiconsIcon icon={TrashIcon} aria-hidden />
            Delete
          </Button>
        </div>
      ) : null}

      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{asset.title}”?</DialogTitle>
            <DialogDescription>
              The document is removed. You can regenerate it from your deck at
              any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              <HugeiconsIcon icon={TrashIcon} aria-hidden />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (body && typeof body === "object" && "error" in body) {
    const value = (body as { error: unknown }).error;
    if (typeof value === "string" && value.length > 0) return value;
  }

  return fallback;
}
