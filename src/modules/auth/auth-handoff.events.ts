export type AuthHandoffSecurityEvent =
  | "handoff_authorize_succeeded"
  | "handoff_authorize_denied"
  | "handoff_exchange_succeeded"
  | "handoff_exchange_denied";

export function logAuthHandoffSecurityEvent(
  event: AuthHandoffSecurityEvent,
  clientId: string,
): void {
  console.info(
    JSON.stringify({
      category: "security",
      event,
      clientId,
    }),
  );
}
