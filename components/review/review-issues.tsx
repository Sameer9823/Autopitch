import { HugeiconsIcon } from "@hugeicons/react";

import {
  Alert02Icon,
  CheckIcon,
  InformationCircleIcon,
  Target01Icon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { reviewCategoryLabel } from "@/components/review/category-scores";
import type { ReviewIssue } from "@/lib/ai/investor-review";
import { cn } from "@/lib/utils";

/**
 * Review issues, in the three-part form that is the core UX of the review.
 *
 *   ISSUE            what is wrong
 *   WHY IT MATTERS   what an investor concludes as a result
 *   RECOMMENDATION   the concrete change to make
 *
 * Keeping these as three visibly separate blocks is deliberate. A single run of
 * prose collapses back into a to-do list nobody acts on; three labelled fields
 * make the founder's work self-evident and make it obvious which part is missing.
 *
 * The same renderer serves absent information ("Missing information"), because
 * from the founder's side those two are the same shape of work: something the
 * deck does not say yet, and why that matters. The difference is explicit — a
 * missing item is labelled "Data needed" and says plainly that it is not a fault
 * of the writing.
 */

const SEVERITY_STYLES: Record<ReviewIssue["severity"], string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-border bg-surface-4 text-muted-foreground",
  low: "border-border bg-surface-4 text-subtle-foreground",
};

const SEVERITY_LABELS: Record<ReviewIssue["severity"], string> = {
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};

function Part({
  label,
  icon,
  children,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-[0.14em] text-subtle-foreground uppercase">
        {icon}
        {label}
      </p>
      <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function IssueCard({
  issue,
  isMissing,
}: {
  issue: ReviewIssue;
  isMissing: boolean;
}) {
  return (
    <li
      className={cn(
        "rv-surface flex flex-col gap-3 p-4 sm:p-5",
        isMissing && "border-brand/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isMissing ? (
          <Badge className="bg-brand text-primary-foreground">
            <HugeiconsIcon icon={InformationCircleIcon} aria-hidden />
            Data needed
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className={cn("border", SEVERITY_STYLES[issue.severity])}
          >
            {SEVERITY_LABELS[issue.severity]}
          </Badge>
        )}

        <Badge variant="secondary">{reviewCategoryLabel(issue.category)}</Badge>

        {issue.slideOrder ? (
          <span className="text-xs text-subtle-foreground">
            Slide {issue.slideOrder}
          </span>
        ) : null}
      </div>

      <Part
        label="Issue"
        icon={<HugeiconsIcon icon={Alert02Icon} className="size-3.5" aria-hidden />}
        className="text-foreground"
      >
        <p className="font-heading text-sm font-medium text-foreground">
          {issue.title}
        </p>
      </Part>

      <Part
        label="Why it matters"
        icon={<HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" aria-hidden />}
      >
        <p>{issue.whyItMatters}</p>
      </Part>

      <div className="rounded-lg border border-brand/30 bg-brand/8 p-3">
        <Part
          label="Recommendation"
          icon={<HugeiconsIcon icon={Target01Icon} className="size-3.5" aria-hidden />}
        >
          <p className="text-foreground">{issue.recommendation}</p>
        </Part>
      </div>
    </li>
  );
}

function IssueSection({
  id,
  title,
  description,
  issues,
  isMissing,
  emptyMessage,
}: {
  id: string;
  title: string;
  description: string;
  issues: readonly ReviewIssue[];
  isMissing: boolean;
  emptyMessage: string;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="font-heading text-sm font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 text-xs text-subtle-foreground">{description}</p>

      {issues.length === 0 ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">
          <HugeiconsIcon icon={CheckIcon} className="size-3.5 text-success" aria-hidden />
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {issues.map((issue, index) => (
            <IssueCard
              key={`${issue.title}-${issue.category}-${index}`}
              issue={issue}
              isMissing={isMissing}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Absent information.
 *
 * Rendered as its own panel, and explicitly framed as data the founder must
 * supply — not as a criticism of the writing, and never with a number in place of
 * the missing one.
 */
export function MissingInformation({ items }: { items: readonly ReviewIssue[] }) {
  return (
    <div className="rv-surface-raised flex flex-col gap-3 p-4 sm:p-5">
      <IssueSection
        id="missing-information"
        title="Missing information"
        description="Facts a reader needs and this deck does not contain. Each one is data you supply — nothing here has been estimated or filled in on your behalf."
        issues={items}
        isMissing
        emptyMessage="The deck covers every category an investor will ask about."
      />
    </div>
  );
}

export function ReviewIssues({ issues }: { issues: readonly ReviewIssue[] }) {
  return (
    <IssueSection
      id="review-issues"
      title="Issues in this deck"
      description="Weaknesses that are already on the page. Each one is an issue, the consequence an investor draws from it, and the change that closes it."
      issues={issues}
      isMissing={false}
      emptyMessage="No structural issues were found — only improvements below."
    />
  );
}
