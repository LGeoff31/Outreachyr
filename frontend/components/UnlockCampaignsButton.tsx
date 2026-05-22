"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startCampaignUnlockCheckout } from "@/lib/billing";

type UnlockCampaignsButtonProps = {
  className?: string;
  size?: "default" | "lg";
  variant?: "default" | "outline";
  label?: string;
};

export function UnlockCampaignsButton({
  className,
  size = "lg",
  variant = "default",
  label = "Unlock for $5",
}: UnlockCampaignsButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={loading}
        className={cn(
          size === "lg" && "min-h-11 w-full rounded-xl text-base font-semibold",
          variant === "default" && size === "lg" && "shadow-lg shadow-primary/15"
        )}
        onClick={() => {
          setLoading(true);
          setError(null);
          void startCampaignUnlockCheckout().catch((e: unknown) => {
            setError(
              e instanceof Error ? e.message : "Could not start checkout."
            );
            setLoading(false);
          });
        }}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Redirecting…
          </>
        ) : (
          label
        )}
      </Button>
      {error ? (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
