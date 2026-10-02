import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

/**
 * RAISEVIA AI wordmark.
 *
 * A single restrained accent mark — no glow, no gradient blob. The wordmark is
 * the brand; the mark is a quiet "raise" chevron in the accent colour.
 */
export function BrandMark({
  className,
  showWordmark = true,
  size = "default",
}: {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "default";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "grid place-items-center rounded-md bg-brand text-primary-foreground",
          size === "sm" ? "size-6" : "size-7",
        )}
      >
        <HugeiconsIcon
          icon={ArrowUpRight01Icon}
          className={size === "sm" ? "size-3.5" : "size-4"}
          aria-hidden
        />
      </span>
      {showWordmark ? (
        <span
          className={cn(
            "font-heading font-semibold tracking-tight",
            size === "sm" ? "text-sm" : "text-[0.9375rem]",
          )}
        >
          Raisevia<span className="text-muted-foreground"> AI</span>
        </span>
      ) : null}
      <span className="sr-only">Raisevia AI</span>
    </span>
  );
}
