import { redirect } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

/**
 * Authenticated application shell.
 *
 * Per the Next.js guidance, the session is verified HERE (in the layout, as the
 * first thing before rendering) AND again in every data access layer call, so
 * authorization never depends on this layout having re-run.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser().catch(() => null);

  if (!user) {
    redirect("/login");
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { name: true },
  });

  return (
    <AppNav
      user={{
        name: user.name,
        email: user.email,
        workspaceName: workspace?.name ?? "Workspace",
      }}
    >
      {children}
    </AppNav>
  );
}
