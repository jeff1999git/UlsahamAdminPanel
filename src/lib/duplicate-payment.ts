import type { logActivity } from "@/lib/activity-logger"

/**
 * The activity log entry for a second payment on a ticket that was already
 * paid: two tabs, or two orders made while it was unpaid. The ticket stays as
 * it is and the buyer still gets it; the entry names the extra payment so
 * staff can refund it in Razorpay.
 */
export function duplicatePaymentLog(
  source: "payment-verify" | "razorpay-webhook",
  ticket: { id: string; eventId: string; name: string; phone: string; ticketCode: string; paymentId: string | null },
  payment: { paymentId: string; orderId: string }
): Parameters<typeof logActivity>[0] {
  return {
    adminUsername: source,
    adminRole: "SYSTEM",
    action: "PARTICIPANT_UPDATED",
    entity: "Participant",
    entityId: ticket.id,
    description: `Duplicate payment ${payment.paymentId} for already-paid ticket ${ticket.ticketCode} (${ticket.name}) — refund it in Razorpay`,
    metadata: {
      eventId: ticket.eventId,
      ticketCode: ticket.ticketCode,
      phone: ticket.phone,
      duplicatePaymentId: payment.paymentId,
      orderId: payment.orderId,
      paidWith: ticket.paymentId,
    },
  }
}
