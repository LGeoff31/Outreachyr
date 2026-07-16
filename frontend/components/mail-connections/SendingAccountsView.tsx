"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  enabledMailProviders,
  getMailProvider,
} from "@/lib/mail-connections/providers";
import { mailConnectionCallbackErrorMessage } from "@/lib/mail-connections/errors";
import type { MailConnection } from "@/lib/mail-connections/types";
import { isUsableMailConnection } from "@/lib/mail-connections/selectors";
import { cn } from "@/lib/utils";

import { useMailConnections } from "./MailConnectionsProvider";

function statusLabel(status: MailConnection["status"]): string {
  if (status === "connected") return "Connected";
  if (status === "reconnect_required") return "Reconnect required";
  return "Needs attention";
}

function verifiedLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `Verified ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export function SendingAccountsView() {
  const searchParams = useSearchParams();
  const {
    connections,
    availableProviderIds,
    loading,
    error,
    mutatingId,
    authorizingProviderId,
    reload,
    authorize,
    makeDefault,
    disconnect,
  } = useMailConnections();
  const [disconnectTarget, setDisconnectTarget] =
    useState<MailConnection | null>(null);
  const enabledProviders = useMemo(
    () => enabledMailProviders(availableProviderIds),
    [availableProviderIds]
  );
  const callbackConnected = searchParams.get("mail_connection") === "connected";
  const callbackError = searchParams.get("mail_connection_error");
  const initialLoadFailed = Boolean(error) && connections.length === 0;
  const anyMutation = Boolean(mutatingId || authorizingProviderId);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Sending accounts
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Connect the mailboxes Outreachyr can send from. Your app sign-in is
            separate from these accounts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {enabledProviders.map((provider) => (
            <Button
              key={provider.id}
              type="button"
              className="rounded-xl"
              disabled={anyMutation}
              onClick={() => void authorize(provider.id)}
            >
              {authorizingProviderId === provider.id ? (
                <Loader2
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden
                />
              ) : (
                <provider.Logo
                  data-icon="inline-start"
                  className="size-4"
                  aria-hidden
                />
              )}
              {authorizingProviderId === provider.id
                ? "Connecting…"
                : provider.connectLabel}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {callbackConnected ? (
          <Alert className="border-primary/30 bg-primary/10">
            <CheckCircle2 aria-hidden />
            <AlertTitle>Sending account connected</AlertTitle>
            <AlertDescription>
              Your mailbox is ready to use for campaigns.
            </AlertDescription>
          </Alert>
        ) : null}

        {callbackError ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>Could not connect account</AlertTitle>
            <AlertDescription>
              {mailConnectionCallbackErrorMessage(callbackError)}
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>Sending accounts unavailable</AlertTitle>
            <AlertDescription>
              {error}
              <Button
                type="button"
                variant="link"
                size="sm"
                className="ml-1 h-auto p-0 align-baseline"
                onClick={() => void reload()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <div className="grid gap-4" aria-label="Loading sending accounts">
            {[0, 1].map((index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-2xl border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : initialLoadFailed ? null : connections.length === 0 ? (
          <Empty className="min-h-72 border border-dashed border-border bg-muted/20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Send aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No sending accounts yet</EmptyTitle>
              <EmptyDescription>
                Connect a mailbox to send campaigns. You can still create and
                preview campaigns before connecting one.
              </EmptyDescription>
            </EmptyHeader>
            {enabledProviders.length > 0 ? (
              <EmptyContent className="flex flex-wrap justify-center gap-2">
                {enabledProviders.map((provider) => (
                  <Button
                    key={provider.id}
                    type="button"
                    className="rounded-xl"
                    disabled={anyMutation}
                    onClick={() => void authorize(provider.id)}
                  >
                    <provider.Logo
                      data-icon="inline-start"
                      className="size-4"
                      aria-hidden
                    />
                    {provider.connectLabel}
                  </Button>
                ))}
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <div className="grid gap-4">
            {connections.map((connection) => {
              const provider = getMailProvider(connection.provider);
              const authorizationEnabled = enabledProviders.some(
                ({ id }) => id === connection.provider
              );
              const usable =
                authorizationEnabled && isUsableMailConnection(connection);
              const ProviderLogo = provider?.Logo;
              const verified = verifiedLabel(connection.last_verified_at);
              const busy = anyMutation;
              return (
                <Card
                  key={connection.id}
                  className="rounded-2xl border-border bg-card shadow-sm"
                >
                  <CardHeader className="gap-3 sm:grid-cols-[auto_1fr]">
                    <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-background">
                      {ProviderLogo ? (
                        <ProviderLogo className="size-6" aria-hidden />
                      ) : (
                        <Mail className="size-5 text-muted-foreground" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="truncate text-base">
                          {connection.display_name?.trim() || connection.email}
                        </CardTitle>
                        {connection.is_default ? (
                          <Badge variant="secondary">Default</Badge>
                        ) : null}
                        <Badge
                          variant={
                            connection.status === "connected"
                              ? "outline"
                              : "destructive"
                          }
                          className={cn(
                            connection.status === "connected" &&
                              "border-primary/30 text-primary"
                          )}
                        >
                          {statusLabel(connection.status)}
                        </Badge>
                      </div>
                      <CardDescription className="mt-1 break-all">
                        {connection.email} · {provider?.displayName ?? connection.provider}
                        {verified ? ` · ${verified}` : ""}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    {!connection.is_default && usable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        disabled={busy}
                        onClick={() => void makeDefault(connection.id)}
                      >
                        Make default
                      </Button>
                    ) : null}
                    {provider && authorizationEnabled ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        disabled={busy}
                        onClick={() =>
                          void authorize(connection.provider, connection.id)
                        }
                      >
                        {authorizingProviderId === connection.provider ? (
                          <Loader2
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <RefreshCw data-icon="inline-start" aria-hidden />
                        )}
                        {provider.reconnectLabel}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="ml-auto rounded-xl"
                      disabled={busy}
                      onClick={() => setDisconnectTarget(connection)}
                    >
                      <Trash2 data-icon="inline-start" aria-hidden />
                      Disconnect
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Ready to send?{" "}
          <Link
            href="/dashboard/new"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create a campaign
          </Link>
          .
        </p>
      </div>

      <ConfirmDialog
        open={Boolean(disconnectTarget)}
        title="Disconnect sending account?"
        description={
          disconnectTarget
            ? `Outreachyr will no longer be able to send from ${disconnectTarget.email}. Existing campaign history will remain available.`
            : ""
        }
        confirmLabel="Disconnect account"
        confirming={
          disconnectTarget ? mutatingId === disconnectTarget.id : false
        }
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
        onConfirm={() => {
          const target = disconnectTarget;
          if (!target) return;
          void disconnect(target.id).then((disconnected) => {
            if (disconnected) setDisconnectTarget(null);
          });
        }}
      />
    </main>
  );
}
