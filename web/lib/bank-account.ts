/** A bank account being typed into a form (the bank is picked from VietQR's list). */
export interface PayoutDraft {
  bankBin: string
  accountNo: string
  accountName: string
}

export const EMPTY_PAYOUT: PayoutDraft = {
  bankBin: "",
  accountNo: "",
  accountName: "",
}

/** Upper-case, accent-free text — how a banking app shows an account holder. */
export function toBankAccountName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "D")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

/** Digits only, no spaces — what a transfer needs. */
export const normalizeAccountNo = (value: string) => value.replace(/\s+/g, "")

/** Whether the draft would pass the API's `PayoutDto` validation. */
export function isPayoutValid(draft: PayoutDraft): boolean {
  return (
    /^\d{6}$/.test(draft.bankBin) &&
    /^\d{6,20}$/.test(normalizeAccountNo(draft.accountNo)) &&
    /^[A-Z ]{2,60}$/.test(toBankAccountName(draft.accountName))
  )
}
