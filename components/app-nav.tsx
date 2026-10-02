"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Analytics01Icon,
  CompareIcon,
  Chat01Icon,
  DashboardIcon,
  LayoutGridIcon,
  MagicWand01Icon,
  NotificationIcon,
  PlusIcon,
  SearchIcon,
  Settings01Icon,
  Share01Icon,
  Task01Icon,
} from "@/components/icons";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

/**
 * Workspace-level destinations.
 *
 * The Fundraising Kit is deliberately absent here: `FundraisingAsset` is scoped
 * by `deckId`, and every route that generates one is under `/api/decks/[id]`, so
 * it belongs to the deck sub-nav rather than being a workspace page.
 */
const PRIMARY_NAV = [
  { href: "/", label: "Dashboard", icon: DashboardIcon, exact: true },
  { href: "/decks", label: "My Decks", icon: LayoutGridIcon },
  { href: "/templates", label: "Templates", icon: Task01Icon },
  { href: "/brand-kit", label: "Brand Kit", icon: Settings01Icon },
  { href: "/analytics", label: "Analytics", icon: Analytics01Icon },
];

const DECK_NAV = [
  { href: "editor", label: "Editor", icon: LayoutGridIcon },
  { href: "review", label: "Investor Review", icon: Analytics01Icon },
  { href: "practice", label: "Q&A Practice", icon: Chat01Icon },
  { href: "chat", label: "Chat with Deck", icon: Chat01Icon },
  { href: "fundraising", label: "Fundraising Kit", icon: MagicWand01Icon },
  { href: "versions", label: "Versions", icon: CompareIcon },
  { href: "analytics", label: "Analytics", icon: Analytics01Icon },
  { href: "share", label: "Share", icon: Share01Icon },
];

export type AppShellUser = {
  name: string | null;
  email: string;
  workspaceName: string;
};

export function AppNav({
  user,
  children,
}: {
  user: AppShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDeckRoute = /^\/decks\/[^/]+/.test(pathname);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
          <Link
            href="/"
            className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <BrandMark />
          </Link>

          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 lg:flex"
          >
            {PRIMARY_NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden md:block">
              <HugeiconsIcon
                icon={SearchIcon}
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Search decks…"
                aria-label="Search decks"
                className="h-9 w-56 pl-9"
              />
            </div>

            <Button variant="default" size="sm" render={<Link href="/decks/new" />}>
              <HugeiconsIcon icon={PlusIcon} aria-hidden />
              <span className="hidden sm:inline">New Deck</span>
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Notifications"
              className="relative"
            >
              <HugeiconsIcon icon={NotificationIcon} aria-hidden />
              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-brand" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Account menu"
                    className="gap-2 px-2"
                  />
                }
              >
                <span className="grid size-6 place-items-center rounded-full bg-secondary text-[0.6875rem] font-semibold">
                  {initials(user.name ?? user.email)}
                </span>
                <span className="hidden max-w-28 truncate text-sm lg:inline">
                  {user.name ?? user.email}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="truncate text-sm font-medium">
                    {user.name ?? "Founder"}
                  </span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/templates" />}>
                  <HugeiconsIcon icon={Task01Icon} aria-hidden />
                  Templates
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/brand-kit" />}>
                  <HugeiconsIcon icon={Settings01Icon} aria-hidden />
                  Brand Kit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => void signOutAction()}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isDeckRoute ? <DeckSubNav /> : null}
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}

function DeckSubNav() {
  const pathname = usePathname();
  const segments = pathname.split("/");
  const deckId = segments[2];
  const current = segments[3];

  if (!deckId) return null;

  return (
    <nav
      aria-label="Deck sections"
      className="flex items-center gap-1 overflow-x-auto border-t border-border px-4 lg:px-6"
    >
      {DECK_NAV.map((item) => {
        const href = `/decks/${deckId}/${item.href}`;
        const active = current === item.href;
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              active
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={item.icon} className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function initials(value: string): string {
  const source = value.includes("@") ? value.split("@")[0] : value;
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
