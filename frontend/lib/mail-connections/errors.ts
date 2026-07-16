const RECONNECT_CODES = new Set([
  "mail_connection_reconnect_required",
  "mailbox_reauth_required",
  "mailbox_permission_denied",
  "mailbox_authorization_failed",
]);

const MANAGE_ACCOUNT_CODES = new Set([
  "mail_connection_required",
  "mail_connection_not_found",
  "mail_connection_send_not_supported",
  "mail_connection_provider_mismatch",
]);

export function mailConnectionErrorGuidance(
  code: string | undefined
): { message: string; manageAccounts: boolean } | null {
  if (!code) return null;
  if (RECONNECT_CODES.has(code)) {
    return {
      message: "Reconnect this sending account, or choose another account.",
      manageAccounts: true,
    };
  }
  if (MANAGE_ACCOUNT_CODES.has(code)) {
    return {
      message: "Choose a connected sending account before trying again.",
      manageAccounts: true,
    };
  }
  return null;
}

export function mailConnectionCallbackErrorMessage(code: string): string {
  if (code === "mailbox_permission_denied") {
    return "Mailbox authorization was canceled.";
  }
  if (code === "mail_connection_account_mismatch") {
    return "The account you authorized does not match the account being reconnected.";
  }
  return "The sending account could not be connected. Please try again.";
}

export async function resolveMailConnectionSendError(
  code: string | undefined,
  reloadConnections: () => Promise<void>
): Promise<{ message: string; manageAccounts: boolean } | null> {
  const guidance = mailConnectionErrorGuidance(code);
  if (guidance) {
    await reloadConnections();
  }
  return guidance;
}
