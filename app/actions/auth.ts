"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { sanitizeNext } from "@/lib/auth/next-redirect";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  destroyCurrentSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * Server Functions for auth.
 *
 * Per the Next.js security guidance, every Server Function re-verifies the
 * session itself — the Proxy is an optimistic redirect layer only and is never
 * treated as the authorization boundary.
 */

const signupSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200),
  workspaceName: z.string().trim().min(1).max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Please enter your password."),
  next: z.string().optional(),
});

export type AuthFormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    workspaceName: formData.get("workspaceName") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const { name, email, password, workspaceName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      status: "error",
      message: "An account with this email already exists.",
      fieldErrors: { email: "Already registered." },
    };
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, name, passwordHash },
    });

    await tx.workspace.create({
      data: {
        name: workspaceName?.trim() || `${name}'s workspace`,
        members: {
          create: { userId: created.id, role: "OWNER" },
        },
      },
    });

    return created;
  });

  const token = await createSession(user.id);
  await setSessionCookie(token);

  redirect("/");
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const { email, password, next } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Same message for unknown email and wrong password — do not reveal which.
  const invalid: AuthFormState = {
    status: "error",
    message: "Incorrect email or password.",
  };

  if (!user) {
    // Constant-ish work to avoid a fast user-enumeration timing signal.
    await verifyPassword(password, "scrypt$00$00");
    return invalid;
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return invalid;
  }

  const token = await createSession(user.id);
  await setSessionCookie(token);

  // Re-validated here as well: the hidden field is client-controllable.
  redirect(sanitizeNext(next));
}

export async function signOutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}
