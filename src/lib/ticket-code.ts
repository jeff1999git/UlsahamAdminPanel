import { TICKET_CODE_PREFIX } from "@/constants"

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

function randomChars(length: number): string {
  let result = ""
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (const byte of array) {
    result += ALPHANUMERIC[byte % ALPHANUMERIC.length]
  }
  return result
}

export function generateTicketCode(eventSlug: string): string {
  const slugPart = eventSlug
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)
    .padEnd(6, "X")

  const randomPart = randomChars(6)

  return `${TICKET_CODE_PREFIX}-${slugPart}-${randomPart}`
}
