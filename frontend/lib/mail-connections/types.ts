export type MailConnectionStatus = "connected" | "reconnect_required" | "error";
export type MailConnectionCapability = "send_mail";

export type MailConnection = {
  id: string;
  provider: string;
  email: string;
  displayName: string | null;
  status: MailConnectionStatus;
  capabilities: MailConnectionCapability[];
  isDefault: boolean;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
};
