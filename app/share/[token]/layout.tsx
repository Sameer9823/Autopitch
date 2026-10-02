import type { Metadata } from "next";

/**
 * Public share viewer layout.
 *
 * Share pages are intentionally never indexed and never followed: they are
 * investor-facing snapshots, not marketing pages, and we do not want search
 * engines crawling private fundraising decks.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}