"use client";

import Link from "next/link";

import { UnlockCampaignsButton } from "@/components/UnlockCampaignsButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function CampaignUnlockRequired() {
  return (
    <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md rounded-2xl border-border/80 shadow-sm shadow-black/[0.03] dark:shadow-black/20">
        <CardHeader className="space-y-2 pb-2 text-center">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Unlock more campaigns
          </CardTitle>
          <CardDescription className="text-base leading-6">
            You&apos;ve used your 3 free campaigns. Pay $5 once to send as many
            campaigns as you need. No subscription.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <UnlockCampaignsButton label="Pay $5 to unlock" />
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/dashboard"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to campaigns
            </Link>
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
