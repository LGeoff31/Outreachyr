import type { MailConnection } from "./types";

export function isUsableMailConnection(connection: MailConnection): boolean {
  return (
    connection.status === "connected" &&
    connection.capabilities.includes("send_mail")
  );
}

export function usableMailConnections(
  connections: MailConnection[],
  availableProviderIds: string[]
): MailConnection[] {
  const availableProviders = new Set(availableProviderIds);
  return connections.filter(
    (connection) =>
      availableProviders.has(connection.provider) &&
      isUsableMailConnection(connection)
  );
}

/** Preserve a usable user choice, otherwise use the default then first usable. */
export function chooseMailConnectionId(
  connections: MailConnection[],
  currentId: string | null,
  availableProviderIds: string[]
): string | null {
  const usable = usableMailConnections(connections, availableProviderIds);
  if (currentId && usable.some(({ id }) => id === currentId)) {
    return currentId;
  }
  return usable.find(({ is_default }) => is_default)?.id ?? usable[0]?.id ?? null;
}
