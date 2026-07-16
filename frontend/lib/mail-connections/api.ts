import {
  apiErrorCode,
  apiErrorMessage,
  apiErrorRetryable,
  readApiResponse,
} from "@/lib/apiError";
import { apiAuthHeaders } from "@/lib/authHeaders";

import type { MailConnection, MailConnectionsPayload } from "./types";

export class MailConnectionsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryable?: boolean
  ) {
    super(message);
    this.name = "MailConnectionsApiError";
  }
}

export function parseMailConnectionsPayload(value: unknown): MailConnectionsPayload {
  const payload = (value ?? {}) as {
    connections?: unknown;
    providers?: unknown;
  };
  const connections = Array.isArray(payload.connections)
    ? (payload.connections as MailConnection[])
    : [];
  const providers = Array.isArray(payload.providers)
    ? payload.providers.filter(
        (provider): provider is string =>
          typeof provider === "string" && provider.length > 0
      )
    : [];
  return { connections, providers };
}

async function throwResponseError(
  response: Response,
  fallback: string
): Promise<never> {
  const { data, text } = await readApiResponse(response);
  throw new MailConnectionsApiError(
    apiErrorMessage(data, text, fallback),
    response.status,
    apiErrorCode(data),
    apiErrorRetryable(data)
  );
}

async function jsonHeaders(): Promise<Record<string, string>> {
  return {
    ...(await apiAuthHeaders()),
    "Content-Type": "application/json",
  };
}

export async function fetchMailConnections(): Promise<MailConnectionsPayload> {
  const response = await fetch("/api/mail-connections", {
    cache: "no-store",
    headers: await apiAuthHeaders(),
  });
  if (!response.ok) {
    return throwResponseError(response, "Could not load sending accounts.");
  }
  return parseMailConnectionsPayload(await response.json());
}

export async function authorizeMailProvider(input: {
  provider: string;
  returnTo: string;
  connectionId?: string;
}): Promise<string> {
  const response = await fetch(
    `/api/mail-connections/${encodeURIComponent(input.provider)}/authorize`,
    {
      method: "POST",
      headers: await jsonHeaders(),
      body: JSON.stringify({
        return_to: input.returnTo,
        ...(input.connectionId ? { connection_id: input.connectionId } : {}),
      }),
    }
  );
  if (!response.ok) {
    return throwResponseError(response, "Could not start mailbox authorization.");
  }
  const payload = (await response.json()) as { authorization_url?: string };
  if (!payload.authorization_url) {
    throw new MailConnectionsApiError(
      "The server did not return an authorization URL.",
      response.status
    );
  }
  return payload.authorization_url;
}

export async function setDefaultMailConnection(id: string): Promise<void> {
  const response = await fetch(
    `/api/mail-connections/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: await jsonHeaders(),
      body: JSON.stringify({ is_default: true }),
    }
  );
  if (!response.ok) {
    await throwResponseError(response, "Could not update the default account.");
  }
}

export async function deleteMailConnection(id: string): Promise<void> {
  const response = await fetch(
    `/api/mail-connections/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: await apiAuthHeaders(),
    }
  );
  if (!response.ok) {
    await throwResponseError(response, "Could not disconnect this account.");
  }
}
