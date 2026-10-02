import { HugeiconsIcon } from "@hugeicons/react";

import { ScoreBar } from "@/components/review/category-scores";
import {
  CheckmarkCircle01Icon,
  InformationCircleIcon,
  SparklesIcon,
  Target01Icon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import type { AnswerEvaluation } from "@/lib/schemas/investor-questions";

/**
 * The feedback for one practice answer.
 *
 * Two rules shape this component.
 *
 * First, the suggested answer is a SUGGESTION and is labelled as one everywhere it
 * appears. A model answer that reads like a fact is the fastest way to get a
 * founder to repeat a number they do not have, so it is gated behind an explicit
 * reveal and carries its own explanation of what it is.
 *
 * Second, `dataNeeded` is rendered with the same weight as the score. Those items
 * are the real output of a practice round: the facts to go and get before the
 * meeting, which is why the model is forbidden from filling them in.
 */

/** Human labels for the five dimensions, in the order an investor hears them. */
const DIMENSION_LABELS: Record<string, string> = {
  clarity: "Clarity",
  specificity: "Specificity",
  evidence: "Evidence",
  relevance: "Relevance",
  conciseness: "Conciseness",
};

const DIMENSION_ORDER = [
  "clarity",
  "specificity",
  "evidence",
  "relevance",
  "conciseness",
];

export function AnswerFeedback({
  evaluation,
  answer,
  showSuggested,
}: {
  evaluation: AnswerEvaluation | null;
  /** The founder's own words, shown back so they can compare against the advice. */
  answer: string;
  /** Whether the founder has chosen to reveal the suggested answer. */
  showSuggested: boolean;
}) {
  if (!evaluation) {
    return (
      <p className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">
        This attempt has no stored feedback. It may have been recorded before
        evaluation completed.
      </p>
    );
  }

  const ordered = [...evaluation.dimensionScores].sort(
    (a, b) => DIMENSION_ORDER.indexOf(a.dimension) - DIMENSION_ORDER.indexOf(b.dimension),
  );

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="dimension-scores"
        className="flex flex-col gap-3"
      >
        <h3
          id="dimension-scores"
          className="font-heading text-sm font-semibold tracking-tight"
        >
          How the answer scored
        </h3>

        <dl className="flex flex-col gap-2.5">
          {ordered.map((entry) => {
            const label = DIMENSION_LABELS[entry.dimension] ?? entry.dimension;

            return (
              <div
                key={entry.dimension}
                className="rv-surface flex flex-col gap-1.5 p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-sm font-medium">{label}</dt>
                  <ScoreBar
                    value={entry.score}
                    label={`${label} score`}
                    className="max-w-[14rem]"
                  />
                </div>
                <dd className="text-xs leading-relaxed text-muted-foreground">
                  {entry.feedback}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {evaluation.whatWorked.length > 0 ? (
        <section aria-labelledby="what-worked" className="flex flex-col gap-2">
          <h3
            id="what-worked"
            className="flex items-center gap-1.5 font-heading text-sm font-semibold tracking-tight"
          >
            <HugeiconsIcon
              icon={CheckmarkCircle01Icon}
              className="size-4 text-success"
              aria-hidden
            />
            What worked
          </h3>
          <ul className="flex flex-col gap-1.5">
            {evaluation.whatWorked.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 rounded-lg border border-success/25 bg-success/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
              >
                <span aria-hidden className="text-success">
                  &bull;
                </span>
                <span className="min-w-0 flex-1">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {evaluation.whatNeedsImprovement.length > 0 ? (
        <section
          aria-labelledby="what-needs-improvement"
          className="flex flex-col gap-2"
        >
          <h3
            id="what-needs-improvement"
            className="flex items-center gap-1.5 font-heading text-sm font-semibold tracking-tight"
          >
            <HugeiconsIcon icon={Target01Icon} className="size-4 text-brand" aria-hidden />
            What needs improvement
          </h3>
          <ul className="flex flex-col gap-1.5">
            {evaluation.whatNeedsImprovement.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
              >
                <span aria-hidden className="text-brand">
                  &rarr;
                </span>
                <span className="min-w-0 flex-1">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showSuggested ? (
        <section
          aria-labelledby="suggested-answer"
          className="rv-surface-raised flex flex-col gap-2 p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <HugeiconsIcon icon={SparklesIcon} className="size-4 text-brand" aria-hidden />
            <h3
              id="suggested-answer"
              className="font-heading text-sm font-semibold tracking-tight"
            >
              Suggested stronger answer
            </h3>
            <Badge variant="secondary">Suggestion, not a fact</Badge>
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {evaluation.suggestedAnswer}
          </p>

          <p className="flex items-start gap-1.5 text-xs text-subtle-foreground">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden
            />
            <span>
              This shows the shape and emphasis of a strong answer. It contains no
              facts of its own — replace every figure with one you can defend, or
              remove it.
            </span>
          </p>
        </section>
      ) : null}

      {evaluation.dataNeeded.length > 0 ? (
        <section
          aria-labelledby="answer-data-needed"
          className="rv-surface flex flex-col gap-2 border-brand/30 p-4"
        >
          <h3
            id="answer-data-needed"
            className="flex items-center gap-1.5 font-heading text-sm font-semibold tracking-tight"
          >
            <HugeiconsIcon icon={InformationCircleIcon} className="size-4 text-brand" aria-hidden />
            Data needed
          </h3>
          <p className="text-xs text-subtle-foreground">
            Facts this answer should have had. None of them have been supplied for
            you — go and get them before the meeting.
          </p>
          <ul className="flex flex-col gap-1.5">
            {evaluation.dataNeeded.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-foreground"
              >
                <span aria-hidden className="text-brand">
                  &bull;
                </span>
                <span className="min-w-0 flex-1">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="rv-surface group p-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Your answer as submitted
        </summary>
        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {answer}
        </p>
      </details>
    </div>
  );
}
