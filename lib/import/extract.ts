import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extract plain text from founder-supplied source material.
 *
 * Runs server-side only. Everything is size-capped before parsing so a large
 * upload cannot exhaust memory, and nothing is retained after extraction —
 * only the returned text is passed to the AI.
 */

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_CHARS = 60_000;

export type ImportKind = "pdf" | "pptx" | "text" | "url";

export function assertImportSize(size: number): void {
  if (size > MAX_BYTES) {
    throw new Error("That file is too large. Please upload under 12 MB.");
  }
}

/** Extract text from a PDF buffer. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(doc, { mergePages: true });

  return normalize(text.slice(0, MAX_CHARS));
}

/**
 * Extract text from a PPTX buffer.
 * A PPTX is a zip of XML parts — we read the slide parts and pull the text runs
 * in document order. This is a best-effort import, not a fidelity converter.
 */
export async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return na - nb;
    });

  if (slideNames.length === 0) {
    throw new Error("We could not find any slides in that PPTX file.");
  }

  const parts: string[] = [];

  for (const name of slideNames) {
    const xml = await zip.files[name].async("string");
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeEntities(match[1]))
      .filter(Boolean);

    if (runs.length > 0) {
      const slideNumber = name.match(/slide(\d+)\.xml$/)?.[1] ?? "?";
      parts.push(`Slide ${slideNumber}:\n${runs.join("\n")}`);
    }
  }

  const text = parts.join("\n\n");

  if (text.trim().length === 0) {
    throw new Error("That PPTX appears to contain no readable text.");
  }

  return normalize(text.slice(0, MAX_CHARS));
}

/** Read plain text or markdown. */
export function extractPlainText(input: string): string {
  return normalize(input.slice(0, MAX_CHARS));
}

/**
 * Fetch a public page and reduce it to readable text.
 * Only http(s) is allowed, and the response is size-capped before the HTML is
 * parsed, so this cannot be used to reach internal network services.
 */
export async function extractUrlText(rawUrl: string): Promise<string> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("That does not look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported.");
  }

  if (isPrivateHost(url.hostname)) {
    throw new Error("That address is not a public website.");
  }

  const response = await fetch(url, {
    headers: { "user-agent": "RaiseviaAI/1.0 (+import)" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`We could not open that page (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error("That URL did not return a readable web page.");
  }

  const html = (await response.text()).slice(0, 400_000);
  return normalize(stripHtml(html).slice(0, MAX_CHARS));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalize(text: string): string {
  return decodeEntities(text)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Block obvious internal/loopback targets so import cannot probe the network. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (!ipv4) {
    return false;
  }

  const [a, b] = ipv4.slice(1).map(Number);

  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}
