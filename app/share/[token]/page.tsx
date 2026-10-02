import { notFound } from "next/navigation";

import { ShareViewer } from "@/components/share/share-viewer";
import { loadSharePayload } from "@/lib/share/payload";

export const metadata = { title: "Shared Deck" };
export const dynamic = "force-dynamic";

export default async function SharePage({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;

  // The viewer is unauthenticated; resolveShareToken throws a 404 for
  // revoked / expired / missing links, which we render as a branded message.
  let payload;
  try {
    payload = await loadSharePayload(token);
  } catch {
    notFound();
  }

  return (
    <ShareViewer
      deck={payload.deck}
      slides={payload.slides}
      permission={payload.share.permission}
      totalSlides={payload.slides.length}
      token={token}
    />
  );
}