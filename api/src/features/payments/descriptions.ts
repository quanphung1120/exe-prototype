/** Longest description we hand SePay (it is echoed on the order and receipts). */
const MAX_LENGTH = 120

/**
 * Plain, accent-free text: bank apps and QR memos mangle Vietnamese
 * diacritics, so every description SePay sees is ASCII.
 */
function ascii(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "D")
    .replace(/\s+/g, " ")
    .trim()
}

function clip(text: string): string {
  return text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH).trim() : text
}

/** "2026-10-12" → "12/10". */
function dayMonth(dateKey: string): string {
  const [, month, day] = dateKey.split("-")
  return month && day ? `${day}/${month}` : dateKey
}

/** What the player sees on the SePay page for a wallet top-up. */
export function topUpDescription(invoiceNumber: string): string {
  return clip(`Shuttio nap vi - ${invoiceNumber}`)
}

/** What the player sees for a court booking: which court, when, and the id. */
export function bookingDescription(booking: {
  bookingId: string
  courtName: string
  dateKey: string
  start: string
}): string {
  return clip(
    ascii(
      `Shuttio dat san ${booking.courtName} ${booking.start} ${dayMonth(booking.dateKey)} - ${booking.bookingId}`
    )
  )
}
