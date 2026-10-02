"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useState, useTransition } from "react";

import {
  createShareAction,
  enableShareAction,
  revokeShareAction,
  updateSharePermissionAction,
  type ShareView,
} from "@/app/actions/shares";
import {
  Alert02Icon,
  CancelCircleIcon,
  CheckIcon,
  Copy02Icon,
  Link01Icon,
  Share01Icon,
  UnlinkIcon,
  ViewIcon,
} from "@/components/icons";
import { StatePanel } from "@/components/dashboard/state-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";

/**
 * Share link management for the deck owner.
 *
 * Links are soft-disabled rather than deleted so a revoked link keeps its
 * engagement history. Every mutation is a Server Function that re-verifies
 * ownership server-side — the optimistic UI here is only a convenience.
 */
export function ShareManager({
  deckId,
  initialShares,
}: {
  deckId: string;
  initialShares: ShareView[];
}) {
  const [shares, setShares] = useState(initialShares);
  const [allowDownload, setAllowDownload] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

  function urlFor(token: string) {
    return `${appUrl}/share/${token}`;
  }

  function run(action: () => Promise<{ status: string; share?: ShareView; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status === "error") {
        setError(result.message ?? "Something went wrong.");
        return;
      }
      if (result.share) {
        setShares((current) => {
          const index = current.findIndex((s) => s.id === result.share!.id);
          if (index === -1) return [result.share!, ...current];
          const next = [...current];
          next[index] = result.share!;
          return next;
        });
      }
    });
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      setCopiedId(token);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Your browser blocked clipboard access. Copy the link manually.");
    }
  }

  const active = shares.filter((share) => !share.revokedAt);
  const revoked = shares.filter((share) => share.revokedAt);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-medium">Create a share link</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Anyone with the link can view the deck without an account. You can
          disable the link at any time.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="allow-download"
              checked={allowDownload}
              onCheckedChange={(checked) => setAllowDownload(Boolean(checked))}
            />
            <Label htmlFor="allow-download" className="text-sm">
              Allow download
            </Label>
          </div>

          <Button
            disabled={pending}
            onClick={() =>
              run(() =>
                createShareAction(deckId, {
                  permission: allowDownload ? "VIEW_DOWNLOAD" : "VIEW",
                }),
              )
            }
          >
            <HugeiconsIcon icon={Link01Icon} aria-hidden />
            {pending ? "Creating…" : "Create link"}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>

      {shares.length === 0 ? (
        <StatePanel
          kind="empty"
          title="No share links yet"
          description="Create a link above to send this deck to investors."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {[...active, ...revoked].map((share) => {
            const disabled = Boolean(share.revokedAt);
            const canDownload = share.permission === "VIEW_DOWNLOAD";

            return (
              <li
                key={share.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {urlFor(share.token)}
                    </p>
                    {disabled ? (
                      <Badge variant="outline" className="gap-1">
                        <HugeiconsIcon
                          icon={CancelCircleIcon}
                          className="size-3"
                          aria-hidden
                        />
                        Disabled
                      </Badge>
                    ) : canDownload ? (
                      <Badge variant="secondary" className="gap-1">
                        <HugeiconsIcon
                          icon={CheckIcon}
                          className="size-3"
                          aria-hidden
                        />
                        Download allowed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <HugeiconsIcon icon={ViewIcon} className="size-3" aria-hidden />
                        View only
                      </Badge>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-subtle-foreground">
                    <HugeiconsIcon
                      icon={Share01Icon}
                      className="mr-1 inline size-3"
                      aria-hidden
                    />
                    {share.viewCount} view{share.viewCount === 1 ? "" : "s"} ·
                    created {format(new Date(share.createdAt), "d MMM yyyy")}
                    {share.expiresAt
                      ? ` · expires ${format(new Date(share.expiresAt), "d MMM yyyy")}`
                      : ""}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void copyLink(share.token)}
                  >
                    <HugeiconsIcon
                      icon={copiedId === share.token ? CheckIcon : Copy02Icon}
                      aria-hidden
                    />
                    {copiedId === share.token ? "Copied" : "Copy link"}
                  </Button>

                  <Select
                    value={share.permission}
                    onValueChange={(value) =>
                      run(() =>
                        updateSharePermissionAction(
                          deckId,
                          share.id,
                          value === "VIEW_DOWNLOAD"
                            ? "VIEW_DOWNLOAD"
                            : "VIEW",
                        ),
                      )
                    }
                  >
                    <SelectTrigger size="sm" aria-label="Link permission">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEW">View only</SelectItem>
                      <SelectItem value="VIEW_DOWNLOAD">
                        Allow download
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {disabled ? (
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={pending}
                      onClick={() => run(() => enableShareAction(deckId, share.id))}
                    >
                      Enable
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={pending}
                      onClick={() => run(() => revokeShareAction(deckId, share.id))}
                    >
                      <HugeiconsIcon icon={UnlinkIcon} aria-hidden />
                      Disable
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {revoked.length > 0 ? (
        <p className="flex items-start gap-2 text-xs text-subtle-foreground">
          <HugeiconsIcon
            icon={Alert02Icon}
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden
          />
          Disabled links stop working immediately, but their view history is kept
          so your analytics stay accurate.
        </p>
      ) : null}
    </div>
  );
}
