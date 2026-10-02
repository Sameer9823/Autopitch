"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signInAction, type AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: AuthFormState = { status: "idle" };

export default function LoginPage() {
  const [state, action, pending] = useActionState(signInAction, INITIAL);

  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="text-sm text-muted-foreground">
          Welcome back. Your fundraising workspace is ready.
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            aria-invalid={errors?.email ? true : undefined}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={errors?.password ? true : undefined}
          />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        New to Raisevia AI?{" "}
        <Link
          href="/signup"
          className="text-foreground underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
