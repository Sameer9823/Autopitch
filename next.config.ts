import type { NextConfig } from "next";

/**
 * Hosts that may serve generated slide imagery and uploaded logos.
 *
 * Images come from ImageKit. The stock `ik.imagekit.io` endpoint is always
 * allowed; a self-hosted or custom ImageKit URL endpoint is added from
 * `IMAGEKIT_URL_ENDPOINT` so a deployment that uses one does not need a code
 * change to have its slides optimized by `next/image`.
 */
const imageHosts = ["ik.imagekit.io"];

const customImageEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

if (customImageEndpoint) {
  try {
    const host = new URL(customImageEndpoint).hostname;
    if (host && !imageHosts.includes(host)) {
      imageHosts.push(host);
    }
  } catch {
    // A malformed endpoint is an operator problem, not a build failure. The
    // stock endpoint stays allowed and the images fall back to the browser.
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageHosts.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  },
};

export default nextConfig;
