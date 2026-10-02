import { HugeiconsIcon } from "@hugeicons/react";

import { Alert02Icon, RetryIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/** Shared empty / error states and small score display used across the app. */

export function StatePanel({
  kind,
  title,
  description,
  action,
}: {
  kind: "empty" | "error";
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  if (kind === "error") {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-10 text-center"
      >
        <HugeiconsIcon
          icon={Alert02Icon}
          className="size-6 text-destructive"
          aria-hidden
        />
        <p className="font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        <Button variant="outline" size="sm">
          <HugeiconsIcon icon={RetryIcon} aria-hidden />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <Empty className="rounded-lg border border-dashed border-border bg-surface-1">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function PitchScore({
  score,
  className,
}: {
  score: number | null;
  className?: string;
}) {
  if (score === null) {
    return (
      <span className={cn("text-xs text-subtle-foreground", className)}>
        Not scored
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-baseline gap-0.5", className)}>
      <span className="font-heading text-lg font-semibold tabular-nums text-brand">
        {score}
      </span>
      <span className="text-xs text-subtle-foreground">/100</span>
    </span>
  );
}
