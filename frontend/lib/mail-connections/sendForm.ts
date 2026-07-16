export function appendMailConnectionId(
  data: FormData,
  connectionId: string | null,
  dryRun: boolean
): void {
  if (!dryRun && connectionId) {
    data.append("mail_connection_id", connectionId);
  }
}
