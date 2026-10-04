// The contact lines on a ticket PNG and a participation card. Dependency-free:
// the participants page (server) builds them from Settings, and the ticket and
// card downloads (browser) print them.

export type TicketContacts = {
  /** The phone number as printed. */
  phone: string
  /** The Instagram handle as printed, with its "@". */
  instagram: string
}

/** What tickets printed before the contacts came from Settings. */
export const DEFAULT_TICKET_CONTACTS: TicketContacts = { phone: "9446266011", instagram: "@ulsaham_" }

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am"])
/** First path segments of Instagram pages that are not a profile. */
const NOT_A_PROFILE = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "tv"])
const HANDLE = /^[A-Za-z0-9._]{1,30}$/

/**
 * The "@handle" in an Instagram setting: Settings stores a profile URL
 * (https://instagram.com/ulsaham_), but a bare handle, with or without its
 * "@", is read too. Null for anything else, such as a post's URL.
 */
export function instagramHandle(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  let handle = text.replace(/^@/, "")
  if (/^https?:\/\//i.test(text)) {
    let url: URL
    try {
      url = new URL(text)
    } catch {
      return null
    }
    if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) return null
    handle = url.pathname.split("/").filter(Boolean)[0] ?? ""
    if (NOT_A_PROFILE.has(handle.toLowerCase())) return null
  }
  return HANDLE.test(handle) ? `@${handle}` : null
}

/** The contacts to print: the Settings phone and Instagram, each falling back to the old printed one. */
export function ticketContacts(settings: { phone?: string | null; instagram?: string | null } | null): TicketContacts {
  return {
    phone: settings?.phone?.trim() || DEFAULT_TICKET_CONTACTS.phone,
    instagram: instagramHandle(settings?.instagram) ?? DEFAULT_TICKET_CONTACTS.instagram,
  }
}
