"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signUpAction, type AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: AuthFormState = { status: "idle" };

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUpAction, INITIAL);

  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Create your workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          Start building investor-ready decks with Raisevia AI.
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            aria-invalid={errors?.name ? true : undefined}
            aria-describedby={errors?.name ? "name-error" : undefined}
          />
          {errors?.name ? (
            <p id="name-error" className="text-xs text-destructive">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={errors?.email ? true : undefined}
            aria-describedby={errors?.email ? "email-error" : undefined}
          />
          {errors?.email ? (
            <p id="email-error" className="text-xs text-destructive">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-invalid={errors?.password ? true : undefined}
            aria-describedby={errors?.password ? "password-error" : undefined}
          />
          {errors?.password ? (
            <p id="password-error" className="text-xs text-destructive">
              {errors.password}
            </p>
          ) : (
            <p className="text-xs text-subtle-foreground">
              At least 8 characters.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workspaceName">Workspace name (optional)</Label>
          <Input
            id="workspaceName"
            name="workspaceName"
            placeholder="Acme Inc."
            autoComplete="organization"
          />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
