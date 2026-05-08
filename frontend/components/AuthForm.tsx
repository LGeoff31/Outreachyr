"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AuthMode = "sign-in" | "sign-up";

const authCopy = {
  "sign-in": {
    title: "Sign in",
    description: "Access your campaigns and drafts.",
    button: "Sign in",
    footerLead: "Don't have an account?",
    footerAction: "Sign up",
    footerHref: "/sign-up",
  },
  "sign-up": {
    title: "Sign up",
    description: "Create your Outreachyr workspace.",
    button: "Create account",
    footerLead: "Already have an account?",
    footerAction: "Sign in",
    footerHref: "/sign-in",
  },
} satisfies Record<
  AuthMode,
  {
    title: string;
    description: string;
    button: string;
    footerLead: string;
    footerAction: string;
    footerHref: string;
  }
>;

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [showPassword, setShowPassword] = useState(false);
  const copy = authCopy[mode];
  const isSignUp = mode === "sign-up";

  return (
    <section className="flex min-h-[calc(100svh-4rem)] items-center justify-center bg-background px-4 py-8 sm:px-6 lg:items-start lg:pb-20 lg:pt-[clamp(7rem,16vh,10rem)]">
      <Card
        className={cn(
          "w-full gap-4 rounded-2xl bg-card px-6 py-7 shadow-sm sm:px-7 sm:py-7 lg:px-8 lg:py-8",
          isSignUp ? "max-w-[36rem]" : "max-w-[30rem]"
        )}
      >
        <CardHeader className="px-0">
          <CardTitle className="text-3xl font-semibold leading-none tracking-tight text-foreground">
            {copy.title}
          </CardTitle>
          <CardDescription className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
            {copy.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="px-0">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => event.preventDefault()}
          >
            <FieldGroup
              className={cn(
                "gap-4",
                isSignUp && "lg:grid lg:grid-cols-2 lg:gap-x-4"
              )}
            >
              {isSignUp && (
                <AuthField
                  id="name"
                  label="Name"
                  placeholder="Alex Chen"
                  icon="name"
                  autoComplete="name"
                />
              )}

              <AuthField
                id="email"
                label="Email"
                placeholder="you@company.com"
                icon="email"
                type="email"
                autoComplete="email"
              />

              <Field className={cn(isSignUp && "lg:col-span-2")}>
                <FieldLabel
                  htmlFor="password"
                  className="text-sm font-semibold text-foreground"
                >
                  Password
                </FieldLabel>
                <div className="relative">
                  <LockKeyhole
                    aria-hidden="true"
                    className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground lg:size-4"
                  />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    required
                    className="h-12 rounded-xl border-border pl-11 pr-12 text-base text-foreground placeholder:text-muted-foreground lg:h-11 lg:pl-10 lg:text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full text-muted-foreground"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </Field>
            </FieldGroup>

            {!isSignUp && (
              <p className="self-end text-sm font-semibold text-primary sm:text-base">
                Forgot password?
              </p>
            )}

            <Button
              type="button"
              size="lg"
              className="min-h-12 rounded-xl px-6 text-base font-semibold shadow-lg shadow-primary/15 lg:min-h-11 lg:text-sm"
            >
              {copy.button}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground sm:text-base">
            {copy.footerLead}{" "}
            <Link
              href={copy.footerHref}
              className="font-semibold text-primary transition hover:text-primary/80"
            >
              {copy.footerAction}
            </Link>
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function AuthField({
  id,
  label,
  placeholder,
  icon,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  placeholder: string;
  icon: "email" | "name";
  type?: string;
  autoComplete: string;
}) {
  const Icon = icon === "email" ? Mail : UserRound;

  return (
    <Field>
      <FieldLabel
        htmlFor={id}
        className="text-sm font-semibold text-foreground"
      >
        {label}
      </FieldLabel>
      <div className="relative">
        <Icon
          aria-hidden="true"
          className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground lg:size-4"
        />
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="h-12 rounded-xl border-border pl-11 pr-4 text-base text-foreground placeholder:text-muted-foreground lg:h-11 lg:pl-10 lg:text-sm"
        />
      </div>
    </Field>
  );
}
