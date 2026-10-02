import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import {
  Calendar01Icon,
  CompareIcon,
  EyeIcon,
  RetryIcon,
  UserIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatDistanceToNow } from "date-fns";

export type VersionSummary = {
  id: string;
  number: number;
  summary: string | null;
  isRestoredFrom: number | null;
  createdAt: string;
  createdById: string | null;
};

type VersionListProps = {
  versions: VersionSummary[];
  onRestore?: (version: VersionSummary) => void;
  restoringVersionNumber?: number | null;
};

/**
 * Timeline of versions for a deck.
 *
 * Each row shows the version number, timestamp, creator, and change summary.
 * Restored-from versions are labelled so history is never ambiguous.
 */
export function VersionList({
  versions,
  onRestore,
  restoringVersionNumber = null,
}: VersionListProps) {
  if (versions.length === 0) {
    return (
      <Empty className="rounded-lg border border-dashed border-border bg-surface-1">
        <EmptyHeader>
          <EmptyTitle>No versions yet</EmptyTitle>
          <EmptyDescription>
            Save your first version to start tracking deck history. Versions
            are never deleted, so you can always restore an earlier state.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <p className="text-xs text-subtle-foreground">
            A version is saved automatically before major changes and on
            demand from the action above.
          </p>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <ol className="relative flex flex-col gap-3 border-l border-border pl-6">
      {versions.map((version) => {
        const isRestoring = restoringVersionNumber === version.number;
        return (
          <li key={version.id} className="relative ml-3">
            <span className="absolute -left-3.5 grid size-6 place-items-center rounded-full border border-border bg-surface-2">
              <HugeiconsIcon
                icon={version.isRestoredFrom ? RetryIcon : CompareIcon}
                className="size-3.5 text-brand"
                aria-hidden
              />
            </span>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-sm font-semibold">
                      Version {version.number}
                    </span>
                    {version.isRestoredFrom ? (
                      <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-brand">
                        Restored from v{version.isRestoredFrom}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <HugeiconsIcon
                      icon={Calendar01Icon}
                      className="mr-1 inline size-3 align-text-bottom"
                      aria-hidden
                    />
                    {formatDistanceToNow(new Date(version.createdAt), {
                      addSuffix: true,
                    })}
                    {version.createdById ? (
                      <>
                        {" · "}
                        <HugeiconsIcon
                          icon={UserIcon}
                          className="mr-1 inline size-3 align-text-bottom"
                          aria-hidden
                        />
                        {version.createdById}
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    render={<Link href={`/decks/versions/${version.id}`} />}
                  >
                    <HugeiconsIcon icon={EyeIcon} aria-hidden />
                    View
                  </Button>
                  {onRestore ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRestoring}
                      onClick={() => onRestore(version)}
                    >
                      {isRestoring ? (
                        <HugeiconsIcon icon={RetryIcon} aria-hidden />
                      ) : (
                        <HugeiconsIcon icon={RetryIcon} aria-hidden />
                      )}
                      Restore
                    </Button>
                  ) : null}
                </div>
              </div>

              <p className="text-sm text-foreground/90">
                {version.summary ?? "No summary"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}