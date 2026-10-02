import { BrandKitManager } from "@/components/brand/brand-kit-manager";
import type { BrandKit } from "@/components/brand/brand-kit-types";
import { requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

export const metadata = { title: "Brand Kit" };
export const dynamic = "force-dynamic";

/**
 * Workspace brand kits.
 *
 * The route reads through Prisma scoped to the authenticated user's own
 * workspace rather than calling its own HTTP endpoint — a server component
 * should not make a network round-trip to itself just to render its first paint.
 * Authorization is `requireUser()`, and the workspace id comes from the session,
 * never from the URL.
 */
export default async function BrandKitPage() {
  const user = await requireUser();

  const kits = await prisma.brandKit.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      headingFont: true,
      bodyFont: true,
      isDefault: true,
      workspaceId: true,
      updatedAt: true,
    },
  });

  const serialized: BrandKit[] = kits.map((kit) => ({
    ...kit,
    updatedAt: kit.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Brand kit
        </h1>
        <p className="text-sm text-muted-foreground">
          Colours and fonts applied to every deck you build, export and share.
        </p>
      </header>

      <div className="mt-6">
        <BrandKitManager initialKits={serialized} />
      </div>
    </div>
  );
}
