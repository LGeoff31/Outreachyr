export type MailConnectionStatus = "connected" | "reconnect_required" | "error";
export type MailConnectionCapability = "send_mail";

export type MailConnection = {
  id: string;
  provider: string;
  email: string;
  display_name: string | null;
  status: MailConnectionStatus;
  capabilities: MailConnectionCapability[];
  is_default: boolean;
  last_verified_at: string | null;
  last_error_code: string | null;
};

export type MailConnectionsPayload = {
  connections: MailConnection[];
  providers: string[];
};
