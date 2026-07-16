"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  authorizeMailProvider,
  deleteMailConnection,
  fetchMailConnections,
  setDefaultMailConnection,
} from "@/lib/mail-connections/api";
import {
  chooseMailConnectionId,
  usableMailConnections,
} from "@/lib/mail-connections/selectors";
import type { MailConnection } from "@/lib/mail-connections/types";

type MailConnectionsContextValue = {
  connections: MailConnection[];
  usableConnections: MailConnection[];
  availableProviderIds: string[];
  selectedConnection: MailConnection | null;
  selectedConnectionId: string | null;
  loading: boolean;
  error: string | null;
  mutatingId: string | null;
  authorizingProviderId: string | null;
  setSelectedConnectionId: (id: string) => void;
  reload: () => Promise<void>;
  authorize: (provider: string, connectionId?: string) => Promise<void>;
  makeDefault: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<boolean>;
};

const MailConnectionsContext = createContext<MailConnectionsContextValue | null>(
  null
);

function messageFromUnknown(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong with your sending accounts.";
}

export function MailConnectionsProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<MailConnection[]>([]);
  const [availableProviderIds, setAvailableProviderIds] = useState<string[]>([]);
  const [selectedConnectionId, setSelectedConnectionIdState] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [authorizingProviderId, setAuthorizingProviderId] = useState<
    string | null
  >(null);
  const startedInitialLoad = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchMailConnections();
      setConnections(payload.connections);
      setAvailableProviderIds(payload.providers);
      setSelectedConnectionIdState((current) =>
        chooseMailConnectionId(payload.connections, current, payload.providers)
      );
    } catch (nextError) {
      setError(messageFromUnknown(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (startedInitialLoad.current) return;
    startedInitialLoad.current = true;
    void reload();
  }, [reload]);

  const authorize = useCallback(
    async (provider: string, connectionId?: string) => {
      setAuthorizingProviderId(provider);
      setError(null);
      try {
        const authorizationUrl = await authorizeMailProvider({
          provider,
          connectionId,
          returnTo: "/dashboard/settings/sending-accounts",
        });
        window.location.assign(authorizationUrl);
      } catch (nextError) {
        setError(messageFromUnknown(nextError));
        setAuthorizingProviderId(null);
      }
    },
    []
  );

  const makeDefault = useCallback(
    async (id: string) => {
      setMutatingId(id);
      setError(null);
      try {
        await setDefaultMailConnection(id);
        await reload();
      } catch (nextError) {
        setError(messageFromUnknown(nextError));
      } finally {
        setMutatingId(null);
      }
    },
    [reload]
  );

  const disconnect = useCallback(
    async (id: string) => {
      setMutatingId(id);
      setError(null);
      try {
        await deleteMailConnection(id);
        await reload();
        return true;
      } catch (nextError) {
        setError(messageFromUnknown(nextError));
        return false;
      } finally {
        setMutatingId(null);
      }
    },
    [reload]
  );

  const usableConnections = useMemo(
    () => usableMailConnections(connections, availableProviderIds),
    [availableProviderIds, connections]
  );
  const selectedConnection = useMemo(
    () =>
      usableConnections.find(({ id }) => id === selectedConnectionId) ?? null,
    [selectedConnectionId, usableConnections]
  );
  const setSelectedConnectionId = useCallback((id: string) => {
    setSelectedConnectionIdState(id);
  }, []);
  const value = useMemo<MailConnectionsContextValue>(
    () => ({
      connections,
      usableConnections,
      availableProviderIds,
      selectedConnection,
      selectedConnectionId,
      loading,
      error,
      mutatingId,
      authorizingProviderId,
      setSelectedConnectionId,
      reload,
      authorize,
      makeDefault,
      disconnect,
    }),
    [
      connections,
      usableConnections,
      availableProviderIds,
      selectedConnection,
      selectedConnectionId,
      loading,
      error,
      mutatingId,
      authorizingProviderId,
      setSelectedConnectionId,
      reload,
      authorize,
      makeDefault,
      disconnect,
    ]
  );

  return (
    <MailConnectionsContext.Provider value={value}>
      {children}
    </MailConnectionsContext.Provider>
  );
}

export function useMailConnections(): MailConnectionsContextValue {
  const value = useContext(MailConnectionsContext);
  if (!value) {
    throw new Error(
      "useMailConnections must be used inside MailConnectionsProvider"
    );
  }
  return value;
}
