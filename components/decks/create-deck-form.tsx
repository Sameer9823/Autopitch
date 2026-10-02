"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  Alert02Icon,
  File01Icon,
  ImportIcon,
  Note01Icon,
  SparklesIcon,
  CheckIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ImportAnalysis } from "@/lib/schemas/content";

type Mode = "brief" | "import";

const STAGES = [
  { value: "UNKNOWN", label: "Stage not set" },
  { value: "BOOTSTRAP", label: "Bootstrap" },
  { value: "PRE_SEED", label: "Pre-Seed" },
  { value: "SEED", label: "Seed" },
  { value: "SERIES_A", label: "Series A" },
  { value: "SERIES_B", label: "Series B" },
  { value: "GROWTH", label: "Growth" },
  { value: "LATER", label: "Late stage" },
];

export function CreateDeckForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("brief");
  const [startupName, setStartupName] = useState("");
  const [stage, setStage] = useState("UNKNOWN");
  const [idea, setIdea] = useState("");
  const [url, setUrl] = useState("");
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);

  const [analysing, setAnalysing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runImport(body: FormData | Record<string, string>) {
    setAnalysing(true);
    setError(null);
    setAnalysis(null);

    try {
      const isForm = body instanceof FormData;
      const response = await fetch("/api/import", {
        method: "POST",
        ...(isForm
          ? { body: body as FormData }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "We could not read that source.");
        return;
      }

      const result = data as ImportAnalysis;

      setAnalysis(result);
      setIdea(result.idea);
      if (result.startupName) setStartupName(result.startupName);

      setMode("brief");
    } catch {
      setError("We could not reach the server. Please try again.");
    } finally {
      setAnalysing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (idea.trim().length < 20) {
      setError("Describe your startup in at least 20 characters.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, startupName, stage }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      router.push(`/decks/${data.id}/editor`);
    } catch {
      setError("We could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Tabs
        value={mode}
        onValueChange={(value) => setMode(value as Mode)}
      >
        <TabsList>
          <TabsTrigger value="brief">Startup brief</TabsTrigger>
          <TabsTrigger value="import">Import existing material</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            We will read the source and extract what it actually contains.
            Anything it does not cover is listed as{" "}
            <span className="text-foreground">missing information</span> —
            never invented.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-url">Website URL</Label>
            <div className="flex gap-2">
              <Input
                id="import-url"
                type="url"
                inputMode="url"
                placeholder="https://yourstartup.com"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={analysing || url.trim().length === 0}
                onClick={() => void runImport({ url: url.trim() })}
              >
                {analysing ? <Spinner className="size-4" /> : null}
                Analyse
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-file">PDF, PPTX, TXT or MD</Label>
            <input
              ref={fileInput}
              id="import-file"
              type="file"
              accept=".pdf,.pptx,.txt,.md,application/pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const form = new FormData();
                form.append("file", file);
                void runImport(form);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={analysing}
              onClick={() => fileInput.current?.click()}
            >
              <HugeiconsIcon icon={File01Icon} aria-hidden />
              {analysing ? "Reading…" : "Choose a file"}
            </Button>
            <p className="text-xs text-subtle-foreground">
              Up to 12 MB. Your file is parsed in memory and never stored.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-text">Or paste notes</Label>
            <Textarea
              id="import-text"
              rows={5}
              placeholder="Paste an investor update, product brief, or notes…"
            />
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={analysing}
              onClick={() => {
                const element = document.getElementById(
                  "import-text",
                ) as HTMLTextAreaElement | null;
                void runImport({ text: element?.value ?? "" });
              }}
            >
              <HugeiconsIcon icon={Note01Icon} aria-hidden />
              Analyse text
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="brief" className="mt-4 flex flex-col gap-4">
          {analysis ? <ImportSummary analysis={analysis} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startup-name">Startup name (optional)</Label>
              <Input
                id="startup-name"
                value={startupName}
                onChange={(event) => setStartupName(event.target.value)}
                maxLength={160}
                placeholder="Acme Inc."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stage">Fundraising stage</Label>
              <Select value={stage} onValueChange={(value) => setStage(value ?? "UNKNOWN")}>
                <SelectTrigger id="stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="idea">
              Describe your startup, product, and who it is for
            </Label>
            <Textarea
              id="idea"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              rows={8}
              required
              minLength={20}
              disabled={submitting}
              placeholder="A B2B SaaS that automates invoice reconciliation for mid-size finance teams. We charge per entity and currently serve 40 companies across the EU and US."
            />
            <p className="text-xs text-subtle-foreground">
              The more specific you are, the fewer gaps the AI will have to flag.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={submitting || idea.trim().length < 20}
          >
            <HugeiconsIcon
              icon={submitting ? CheckIcon : SparklesIcon}
              aria-hidden
            />
            {submitting ? "Starting…" : "Generate pitch deck"}
          </Button>
        </TabsContent>
      </Tabs>
    </form>
  );
}

/** Shows what was found in the import and, critically, what was not. */
function ImportSummary({ analysis }: { analysis: ImportAnalysis }) {
  const fields = [
    { label: "Company", value: analysis.startupName },
    { label: "Product", value: analysis.product },
    { label: "Problem", value: analysis.problem },
    { label: "Solution", value: analysis.solution },
    { label: "Market", value: analysis.market },
    { label: "Business model", value: analysis.businessModel },
    { label: "Traction", value: analysis.traction },
    { label: "Team", value: analysis.team },
    { label: "Financials", value: analysis.financials },
    { label: "The ask", value: analysis.ask },
  ];

  const found = fields.filter((field) => field.value);
  const missing = analysis.missingFields ?? [];

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={ImportIcon} className="size-4 text-brand" aria-hidden />
        <h2 className="text-sm font-medium">Import summary</h2>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {found.map((field) => (
          <div key={field.label} className="min-w-0">
            <dt className="text-xs text-subtle-foreground">{field.label}</dt>
            <dd className="line-clamp-2 text-sm">{field.value}</dd>
          </div>
        ))}
      </dl>

      {missing.length > 0 ? (
        <div className="mt-4 rounded-md border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <HugeiconsIcon icon={Alert02Icon} className="size-3.5" aria-hidden />
            Missing information
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The source did not cover: {missing.join(", ")}. These will be marked
            as <span className="text-foreground">Data needed</span> rather than
            filled in.
          </p>
        </div>
      ) : null}
    </div>
  );
}
