import type { ParticipationType } from "@prisma/client"

export const PARTICIPATION_TYPE_LABELS: Record<ParticipationType, string> = {
  INDIVIDUAL: "Individual",
  GROUP: "Group",
  BOTH: "Individual & Group",
}

/**
 * Validates the number of participants against a competition's participation
 * type. A registration with 1 person is an individual entry; 2+ is a group
 * entry. Returns an error message, or null when the quantity is allowed.
 * Non-competition events always pass.
 */
export function validateCompetitionQuantity(
  event: { isCompetition: boolean; participationType: ParticipationType },
  quantity: number
): string | null {
  if (!event.isCompetition) return null
  if (event.participationType === "INDIVIDUAL" && quantity > 1) {
    return "This competition accepts individual entries only"
  }
  if (event.participationType === "GROUP" && quantity < 2) {
    return "This competition accepts group entries only (minimum 2 members)"
  }
  return null
}
