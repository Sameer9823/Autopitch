"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import {
  restoreVersionAction,
  saveVersionAction,
} from "@/app/actions/versions";
import { PlusIcon, RetryIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  VersionList,
  type VersionSummary,
} from "@/components/versions/version-list";

async function fetchVersions(deckId: string): Promise<VersionSummary[]> {
  const response = await fetch(`/api/decks/${deckId}/versions`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      (await response.json().catch(() => null))?.error ??
        "Failed to load versions",
    );
  }
  return response.json();
}

export function VersionHistoryClient({ deckId }: { deckId: string }) {
  // `result` records which deck it belongs to so that navigating between decks
  // can be derived as "loading" rather than reset with a setState inside the
  // effect body.
  const [result, setResult] = useState<{
    deckId: string;
    versions: VersionSummary[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  const [saveOpen, setSaveOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<VersionSummary | null>(null);
  const [restoringNumber, setRestoringNumber] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchVersions(deckId)
      .then((data) => {
        if (cancelled) return;
        setResult({ deckId, versions: data });
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load versions",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSettled(true);
      });

    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const isStale = result !== null && result.deckId !== deckId;
  const loading = !settled || isStale;
  const versions = result?.deckId === deckId ? result.versions : null;

  async function refresh() {
    const data = await fetchVersions(deckId);
    setResult({ deckId, versions: data });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await saveVersionAction(deckId, summary);
      if (result.status === "ok") {
        setSaveOpen(false);
        setSummary("");
        await refresh();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save version");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore(version: VersionSummary) {
    setRestoringNumber(version.number);
    try {
      const result = await restoreVersionAction(deckId, version.id);
      if (result.status === "ok") {
        setRestoreTarget(null);
        await refresh();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to restore version",
      );
    } finally {
      setRestoringNumber(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-10 text-center"
      >
        <HugeiconsIcon
          icon={RetryIcon}
          className="size-6 text-destructive"
          aria-hidden
        />
        <p className="font-medium">Could not load versions</p>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
        >
          <HugeiconsIcon icon={RetryIcon} aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogTrigger render={<Button variant="default" size="sm" />}>
            <HugeiconsIcon icon={PlusIcon} aria-hidden />
            Save version
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save version</DialogTitle>
              <DialogDescription>
                Snapshots the current deck state. Versions are never deleted, so
                you can always restore an earlier state.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="version-summary">Change summary</Label>
                <Input
                  id="version-summary"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="e.g. Reworked traction slide"
                  maxLength={400}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A version is also saved automatically before major changes.
              </p>
            </div>
            <DialogFooter>
              <DialogTrigger
                render={<Button variant="outline" />}
                onClick={() => setSaveOpen(false)}
              >
                Cancel
              </DialogTrigger>
              <Button
                onClick={() => void handleSave()}
                disabled={saving || !summary.trim()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <p className="text-xs text-muted-foreground">
          {versions?.length ?? 0} version{versions?.length === 1 ? "" : "s"}
        </p>
      </div>

      <VersionList
        versions={versions ?? []}
        onRestore={setRestoreTarget}
        restoringVersionNumber={restoringNumber}
      />

      <RestoreDialog
        open={restoreTarget !== null}
        version={restoreTarget}
        onConfirm={(version) => void handleRestore(version)}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}

function RestoreDialog({
  open,
  version,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  version: VersionSummary | null;
  onConfirm: (version: VersionSummary) => void;
  onCancel: () => void;
}) {
  if (!version) return null;

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore version {version.number}?</DialogTitle>
          <DialogDescription>
            Restoring applies this snapshot to the live deck and creates a new
            version whose summary notes it was restored from version{" "}
            {version.number}. All prior versions remain intact — history is never
            rewritten.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogTrigger render={<Button variant="outline" />}>Cancel</DialogTrigger>
          <Button variant="default" onClick={() => onConfirm(version)}>
            <HugeiconsIcon icon={RetryIcon} aria-hidden />
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
