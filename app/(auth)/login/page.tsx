import { sanitizeNext } from "@/lib/auth/next-redirect";

import LoginForm from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawNext = params.next;

  return (
    <LoginForm next={sanitizeNext(typeof rawNext === "string" ? rawNext : null)} />
  );
}