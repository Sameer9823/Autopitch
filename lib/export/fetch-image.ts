/**
 * Server-side slide image fetching.
 *
 * Slide visuals live in ImageKit as remote URLs. Both exporters need the actual
 * bytes — a PDF must embed a real image, and a PPTX must embed a real image —
 * so they fetch here, on the server, where the network is reachable.
 *
 * Two rules shape this module:
 *
 *   1. **Never fail an export because of an image.** A missing, slow, oversized
 *      or unsupported image degrades to `null` and the caller draws a neutral
 *      placeholder panel. A founder's deck with one dead CDN link must still
 *      export.
 *   2. **Never cache.** An export must reflect the image on the slide right now,
 *      and a process-lifetime cache would silently ship stale visuals.
 */

/** Formats pdf-lib and pptxgenjs can both embed without transcoding. */
export type EmbeddableImageFormat = "png" | "jpeg";

export type FetchedImage = {
  bytes: Uint8Array;
  format: EmbeddableImageFormat;
};

const DEFAULT_TIMEOUT_MS = 8_000;

/** 12MB is far above any generated slide visual and bounds memory use. */
const MAX_BYTES = 12 * 1024 * 1024;

/** Hosts whose URL grammar lets us ask for a different output format. */
const IMAGEKIT_HOSTS = ["ik.imagekit.io", "imagekit.io"];

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Insert an ImageKit transformation segment asking for PNG.
 *
 * ImageKit's path-style transformations sit immediately after the first path
 * segment: `https://ik.imagekit.io/<id>/tr:f-png/<path>`. Modern browsers and
 * CDNs serve AVIF/WebP by default these days, and neither exporter can embed
 * those, so this gives us one honest chance at a supported format before we fall
 * back to a placeholder.
 */
function withPngTransformation(value: string): string | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!IMAGEKIT_HOSTS.some((host) => url.hostname.endsWith(host))) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const [first, ...rest] = segments as [string, ...string[]];

  if (rest.some((segment) => segment.startsWith("tr:"))) {
    return null;
  }

  url.pathname = `/${[first, "tr:f-png,q-100", ...rest].join("/")}`;
  return url.toString();
}

/** Sniff the container from magic bytes; never trust the `Content-Type` header. */
function detectFormat(bytes: Uint8Array): EmbeddableImageFormat | null {
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }

  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }

  return null;
}

async function download(
  url: string,
  timeoutMs: number,
): Promise<Uint8Array | null> {
  const response = await fetch(url, {
    // Redirects are normal for CDN-hosted visuals, but we still only ever
    // download an image and never forward cookies or credentials.
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "image/*" },
  });

  if (!response.ok) {
    throw new Error(`image request failed with status ${response.status}`);
  }

  // Reject on the declared length before buffering, so an oversized image can
  // never allocate its way past the limit.
  const declared = Number(response.headers.get("Content-Length") ?? "0");

  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new Error("image exceeded the maximum supported size");
  }

  const buffer = await response.arrayBuffer();

  if (buffer.byteLength === 0) {
    throw new Error("image response was empty");
  }

  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("image exceeded the maximum supported size");
  }

  return new Uint8Array(buffer);
}

/**
 * Fetch one slide image, or return `null`.
 *
 * `null` is a normal outcome, not an error: the caller substitutes a
 * placeholder panel. Failures are logged at warn level so a systematically
 * broken image host is visible in server logs without ever surfacing to a user.
 */
export async function fetchSlideImage(
  url: string,
  options: { timeoutMs?: number } = {},
): Promise<FetchedImage | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!isHttpUrl(url)) {
    console.warn("[export] refusing non-http slide image url");
    return null;
  }

  const candidates = [url];
  const transformed = withPngTransformation(url);

  if (transformed) {
    candidates.push(transformed);
  }

  for (const candidate of candidates) {
    try {
      const bytes = await download(candidate, timeoutMs);

      if (!bytes) {
        continue;
      }

      const format = detectFormat(bytes);

      if (!format) {
        // A format we cannot embed: if we still have a transformation left to
        // try, fall through to it rather than giving up immediately.
        console.warn(
          "[export] unsupported image format, drawing a placeholder instead",
        );
        continue;
      }

      return { bytes, format };
    } catch (error: unknown) {
      console.warn("[export] slide image fetch failed", candidate, error);
    }
  }

  return null;
}

/**
 * Resolve every slide image for one export, concurrently.
 *
 * Images are keyed by slide id so the painters can look them up without caring
 * about ordering. A slide with no image is simply absent from the map.
 */
export async function loadExportImages(
  slides: readonly { id: string; image: { url: string } | null }[],
): Promise<Map<string, FetchedImage | null>> {
  const wanted = slides.filter(
    (
      slide,
    ): slide is { id: string; image: { url: string } } => slide.image !== null,
  );

  const resolved = await Promise.all(
    wanted.map(
      async (slide) =>
        [slide.id, await fetchSlideImage(slide.image.url)] as const,
    ),
  );

  return new Map(resolved);
}