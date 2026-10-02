"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState, useTransition } from "react";

import { StatePanel } from "@/components/dashboard/state-panels";
import {
  CheckIcon,
  SparklesIcon,
  TrashIcon,
  WandIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  BRAND_FONT_LABELS,
  SLIDE_SURFACE_HEX,
  type BrandFont,
} from "@/lib/brand/shared";
import {
  readApiError,
  type BrandKit,
  type BrandKitDraft,
  type BrandKitSuggestion,
} from "@/components/brand/brand-kit-types";

/**
 * The empty draft a new kit starts from.
 *
 * `secondaryColor` is the slide background, so it is seeded with the surface the
 * palette is designed against rather than a generic dark grey — a founder who
 * only changes the accent still gets a legible deck.
 */
const EMPTY_DRAFT: BrandKitDraft = {
  name: "",
  logoUrl: null,
  primaryColor: "#141416",
  secondaryColor: SLIDE_SURFACE_HEX,
  accentColor: "#ff7a18",
  headingFont: "Inter",
  bodyFont: "Inter",
  isDefault: false,
};

const FONT_OPTIONS = Object.keys(BRAND_FONT_LABELS) as BrandFont[];

export function BrandKitManager({ initialKits }: { initialKits: BrandKit[] }) {
  const [kits, setKits] = useState(initialKits);
  const [editing, setEditing] = useState<BrandKit | null | "new">(null);
  const [deleting, setDeleting] = useState<BrandKit | null>(null);
  const [suggestion, setSuggestion] = useState<BrandKitSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, startSuggesting] = useTransition();
  const [pending, startPending] = useTransition();

  function run(action: () => Promise<void>) {
    setError(null);
    startPending(() => {
      void action().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      });
    });
  }

  function suggest() {
    setError(null);
    startSuggesting(async () => {
      try {
        const response = await fetch("/api/brand-kits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "suggest" }),
        });

        if (!response.ok) {
          setError(await readApiError(response, "Couldn't suggest a brand kit."));
          return;
        }

        const data = (await response.json()) as { suggestion: BrandKitSuggestion };
        setSuggestion(data.suggestion);
        // Open straight into the editor with the suggestion applied, so the
        // founder is reviewing a real kit rather than reading advice.
        setEditing({
          id: "",
          name: "Suggested brand",
          logoUrl: null,
          primaryColor: data.suggestion.primaryColor,
          secondaryColor: data.suggestion.secondaryColor,
          accentColor: data.suggestion.accentColor,
          headingFont: data.suggestion.headingFont,
          bodyFont: data.suggestion.bodyFont,
          isDefault: kits.length === 0,
          workspaceId: "",
          updatedAt: "",
        });
      } catch {
        setError("We couldn't reach the server. Please try again.");
      }
    });
  }

  async function setDefault(kit: BrandKit) {
    run(async () => {
      const response = await fetch(`/api/brand-kits/${kit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Couldn't set that as default."));
      }

      setKits((current) =>
        current.map((row) => ({ ...row, isDefault: row.id === kit.id })),
      );
    });
  }

  async function remove(kit: BrandKit) {
    run(async () => {
      const response = await fetch(`/api/brand-kits/${kit.id}`, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Couldn't delete that kit."));
      }

      setKits((current) => current.filter((row) => row.id !== kit.id));
      setDeleting(null);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setEditing("new")}>
          <HugeiconsIcon icon={WandIcon} aria-hidden />
          New brand kit
        </Button>

        <Button variant="outline" disabled={suggesting} onClick={suggest}>
          <HugeiconsIcon icon={SparklesIcon} aria-hidden />
          {suggesting ? "Thinking…" : "Suggest with AI"}
        </Button>

        <p className="text-sm text-muted-foreground">
          The default kit is applied to every deck in your workspace.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {suggestion ? (
        <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h2 className="text-sm font-medium">Why this palette</h2>
          <p className="mt-1 text-sm text-muted-foreground">{suggestion.rationale}</p>
          <div className="mt-3 flex gap-2">
            {(
              [
                ["Slide", suggestion.secondaryColor],
                ["Card", suggestion.primaryColor],
                ["Accent", suggestion.accentColor],
              ] as const
            ).map(([label, value]) => (
              <span
                key={label}
                className="flex items-center gap-2 rounded border border-border bg-surface-1 px-2 py-1 text-xs"
              >
                <span
                  aria-hidden
                  className="size-4 rounded-sm border border-border"
                  style={{ backgroundColor: value }}
                />
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono">{value}</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {kits.length === 0 ? (
        <StatePanel
          kind="empty"
          title="No brand kits yet"
          description="A brand kit controls your deck's colours and fonts. Create one by hand, or let AI draft a palette from your existing deck."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kits.map((kit) => (
            <li
              key={kit.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {kit.name}
                    {kit.isDefault ? (
                      <Badge variant="secondary" className="gap-1">
                        <HugeiconsIcon icon={CheckIcon} className="size-3" aria-hidden />
                        Default
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-1 truncate text-xs text-subtle-foreground">
                    {kit.headingFont ?? "Default font"} ·{" "}
                    {kit.bodyFont ?? "default body"}
                  </p>
                </div>

                {kit.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={kit.logoUrl}
                    alt=""
                    className="size-10 shrink-0 rounded border border-border bg-surface-2 object-contain p-1"
                  />
                ) : null}
              </div>

              <div
                className="flex h-8 overflow-hidden rounded border border-border"
                aria-label="Colour palette"
              >
                {(
                  [
                    ["Slide", kit.secondaryColor],
                    ["Card", kit.primaryColor],
                    ["Accent", kit.accentColor],
                  ] as const
                ).map(([label, value]) => (
                  <span
                    key={label}
                    className="flex-1"
                    style={{ backgroundColor: value ?? "transparent" }}
                    title={`${label}: ${value ?? "product default"}`}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setEditing(kit)}
                >
                  Edit
                </Button>

                {!kit.isDefault ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={pending}
                    onClick={() => void setDefault(kit)}
                  >
                    Make default
                  </Button>
                ) : null}

                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-auto text-destructive"
                  onClick={() => setDeleting(kit)}
                >
                  <HugeiconsIcon icon={TrashIcon} aria-hidden />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <KitEditor
          kit={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, wasNew) => {
            setKits((current) =>
              wasNew ? [saved, ...current] : current.map((row) => (row.id === saved.id ? saved : row)),
            );
            setEditing(null);
          }}
        />
      ) : null}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              Decks using this kit fall back to the default theme on their next
              render. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => deleting && void remove(deleting)}
            >
              <HugeiconsIcon icon={TrashIcon} aria-hidden />
              Delete kit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Create or edit one kit.
 *
 * Upload and save are deliberately separate steps: the logo goes to storage on
 * its own request so a failed save never leaves an orphaned file behind, and the
 * returned URL is only committed when the founder saves the kit.
 */
function KitEditor({
  kit,
  onClose,
  onSaved,
}: {
  kit: BrandKit | null;
  onClose: () => void;
  onSaved: (kit: BrandKit, wasNew: boolean) => void;
}) {
  const [draft, setDraft] = useState<BrandKitDraft>(() =>
    kit
      ? {
          name: kit.name,
          logoUrl: kit.logoUrl,
          primaryColor: kit.primaryColor ?? EMPTY_DRAFT.primaryColor,
          secondaryColor: kit.secondaryColor ?? EMPTY_DRAFT.secondaryColor,
          accentColor: kit.accentColor ?? EMPTY_DRAFT.accentColor,
          headingFont: kit.headingFont ?? EMPTY_DRAFT.headingFont,
          bodyFont: kit.bodyFont ?? EMPTY_DRAFT.bodyFont,
          isDefault: kit.isDefault,
        }
      : EMPTY_DRAFT,
  );
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isNew = kit === null;

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const response = await fetch("/api/brand-kits", {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        setError(await readApiError(response, "Couldn't upload that logo."));
        return;
      }

      const data = (await response.json()) as { logoUrl: string };
      setDraft((current) => ({ ...current, logoUrl: data.logoUrl }));
    } catch {
      setError("We couldn't reach the server to upload that logo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        isNew ? "/api/brand-kits" : `/api/brand-kits/${kit.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isNew
              ? { mode: "create", ...draft }
              : {
                  name: draft.name,
                  logoUrl: draft.logoUrl ?? "",
                  primaryColor: draft.primaryColor,
                  secondaryColor: draft.secondaryColor,
                  accentColor: draft.accentColor,
                  headingFont: draft.headingFont,
                  bodyFont: draft.bodyFont,
                  isDefault: draft.isDefault,
                },
          ),
        },
      );

      if (!response.ok) {
        setError(await readApiError(response, "Couldn't save that brand kit."));
        return;
      }

      const data = (await response.json()) as { kit: BrandKit };
      onSaved(data.kit, isNew);
    } catch {
      setError("We couldn't reach the server to save that kit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "New brand kit" : `Edit ${kit.name}`}</DialogTitle>
          <DialogDescription>
            Slide colour is the background your slides render on, card colour is
            the surface that sits on it, and accent is the single bright colour
            used for numbers and highlights.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="kit-name">Name</Label>
            <Input
              id="kit-name"
              value={draft.name}
              maxLength={80}
              placeholder="Acme brand"
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="kit-logo">Logo</Label>
            <div className="flex items-center gap-3">
              {draft.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.logoUrl}
                  alt=""
                  className="size-12 rounded border border-border bg-surface-2 object-contain p-1"
                />
              ) : (
                <div className="grid size-12 place-items-center rounded border border-dashed border-border text-xs text-subtle-foreground">
                  None
                </div>
              )}
              <input
                ref={fileRef}
                id="kit-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadLogo(file);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={uploading}
                render={<label htmlFor="kit-logo" />}
              >
                {uploading ? "Uploading…" : "Choose file"}
              </Button>
              {draft.logoUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDraft((current) => ({ ...current, logoUrl: null }))
                  }
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <ColorField
              id="kit-secondary"
              label="Slide"
              value={draft.secondaryColor}
              onChange={(value) =>
                setDraft((current) => ({ ...current, secondaryColor: value }))
              }
            />
            <ColorField
              id="kit-primary"
              label="Card"
              value={draft.primaryColor}
              onChange={(value) =>
                setDraft((current) => ({ ...current, primaryColor: value }))
              }
            />
            <ColorField
              id="kit-accent"
              label="Accent"
              value={draft.accentColor}
              onChange={(value) =>
                setDraft((current) => ({ ...current, accentColor: value }))
              }
            />
          </div>

          <div
            className="h-16 overflow-hidden rounded-lg border border-border"
            aria-label="Palette preview"
          >
            <div
              className="flex h-full items-center gap-4 p-3"
              style={{ backgroundColor: draft.secondaryColor }}
            >
              <div
                className="rounded px-3 py-1.5 text-sm font-semibold"
                style={{
                  backgroundColor: draft.primaryColor,
                  fontFamily: draft.headingFont,
                }}
              >
                Traction
              </div>
              <span
                className="text-2xl font-bold"
                style={{ color: draft.accentColor }}
              >
                312%
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="kit-heading">Heading font</Label>
              <Select
                value={draft.headingFont}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    headingFont: value ?? EMPTY_DRAFT.headingFont,
                  }))
                }
              >
                <SelectTrigger id="kit-heading" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((font) => (
                    <SelectItem key={font} value={font}>
                      {BRAND_FONT_LABELS[font]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="kit-body">Body font</Label>
              <Select
                value={draft.bodyFont}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    bodyFont: value ?? EMPTY_DRAFT.bodyFont,
                  }))
                }
              >
                <SelectTrigger id="kit-body" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((font) => (
                    <SelectItem key={font} value={font}>
                      {BRAND_FONT_LABELS[font]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="kit-default"
              checked={draft.isDefault}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, isDefault: Boolean(checked) }))
              }
            />
            <Label htmlFor="kit-default" className="text-sm">
              Make this the default kit
            </Label>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || uploading || !draft.name.trim()}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : isNew ? "Create kit" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded border border-border bg-surface-2 p-1"
        />
        <Input
          value={value}
          maxLength={7}
          aria-label={`${label} hex value`}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono text-xs"
        />
      </div>
    </div>
  );
}
