import type { ComponentType, SVGProps } from "react";
import { GoogleLogo } from "@/components/provider-icons/GoogleLogo";

export type MailProviderPresentation = {
  id: string;
  displayName: string;
  connectLabel: string;
  reconnectLabel: string;
  Logo: ComponentType<SVGProps<SVGSVGElement>>;
};

const providers: MailProviderPresentation[] = [
  {
    id: "google",
    displayName: "Gmail",
    connectLabel: "Connect Gmail",
    reconnectLabel: "Reconnect Gmail",
    Logo: GoogleLogo,
  },
];

export function availableMailProviders() {
  return providers;
}

export function enabledMailProviders(ids: string[]) {
  const enabled = new Set(ids);
  return providers.filter((provider) => enabled.has(provider.id));
}

export function getMailProvider(id: string): MailProviderPresentation | null {
  return providers.find((provider) => provider.id === id) ?? null;
}
