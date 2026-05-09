"use client";

import type { ReactNode } from "react";
import { MailCheck, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SettingsView() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background pb-10">
      <form
        onSubmit={(event) => event.preventDefault()}
        className="mx-auto flex w-full max-w-[56rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8"
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Settings
          </h1>
        </div>

        <SettingsCard
          icon={<UserRound aria-hidden="true" />}
          title="Profile"
        >
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="full-name">Full name</FieldLabel>
              <Input
                id="full-name"
                placeholder="Your name"
                className="h-10 rounded-xl"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="h-10 rounded-xl"
              />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="role-focus">Role focus</FieldLabel>
              <Input
                id="role-focus"
                placeholder="Software engineering"
                className="h-10 rounded-xl"
              />
            </Field>
          </FieldGroup>
        </SettingsCard>

        <SettingsCard
          icon={<MailCheck aria-hidden="true" />}
          title="Connected mail"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="gmail-account">Gmail account</FieldLabel>
              <Input
                id="gmail-account"
                placeholder="Not connected"
                readOnly
                className="h-10 rounded-xl"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-10 rounded-xl px-4"
              >
                Reconnect Gmail
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-10 rounded-xl px-4 text-muted-foreground"
              >
                Remove
              </Button>
            </div>
          </FieldGroup>
        </SettingsCard>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled
            className="min-h-10 rounded-xl px-4 shadow-lg shadow-primary/15"
          >
            Save changes
          </Button>
        </div>
      </form>
    </main>
  );
}

function SettingsCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-2xl bg-card shadow-sm">
      <CardHeader className="px-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-5">
            {icon}
          </span>
          <div className="min-w-0">
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}
