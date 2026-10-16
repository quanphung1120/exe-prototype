"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  EMPTY_PAYOUT,
  isPayoutValid,
  normalizeAccountNo,
  toBankAccountName,
  type PayoutDraft,
} from "@/lib/bank-account"
import type { BankInfo } from "@/lib/shared"
import { listBanks, savePayout } from "@/features/venue/venue-actions"

/**
 * The bank list for the picker, loaded once when the form mounts. `error` is
 * set when VietQR's list couldn't be fetched, so the form can say so rather
 * than showing an empty dropdown.
 */
export function useBanks() {
  const [banks, setBanks] = React.useState<BankInfo[] | null>(null)
  const [error, setError] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    listBanks()
      .then((list) => {
        if (!cancelled) setBanks(list)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { banks, error }
}

/**
 * Bank + account number + holder name: where players transfer a booking's
 * money. Shared by the setup wizard (brand step) and the manage screen.
 */
export function PayoutFields({
  value,
  onChange,
  idPrefix = "payout",
}: {
  value: PayoutDraft
  onChange: (next: PayoutDraft) => void
  idPrefix?: string
}) {
  const t = useTranslations("VenuePayout")
  const { banks, error } = useBanks()
  const bank = banks?.find((b) => b.bin === value.bankBin)
  const nameInvalid =
    value.accountName.trim() !== "" &&
    !/^[A-Z ]{2,60}$/.test(toBankAccountName(value.accountName))
  const noInvalid =
    value.accountNo.trim() !== "" &&
    !/^\d{6,20}$/.test(normalizeAccountNo(value.accountNo))

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-bank`}>{t("bank")}</FieldLabel>
        <Select
          value={value.bankBin}
          onValueChange={(v) => v && onChange({ ...value, bankBin: v })}
        >
          <SelectTrigger id={`${idPrefix}-bank`} className="w-full">
            <SelectValue placeholder={t("bankPlaceholder")}>
              {bank ? `${bank.shortName} — ${bank.name}` : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {(banks ?? []).map((b) => (
              <SelectItem key={b.bin} value={b.bin}>
                {b.shortName} — {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error ? <FieldError>{t("banksError")}</FieldError> : null}
      </Field>
      <Field data-invalid={noInvalid || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-no`}>{t("accountNo")}</FieldLabel>
        <Input
          id={`${idPrefix}-no`}
          inputMode="numeric"
          autoComplete="off"
          value={value.accountNo}
          aria-invalid={noInvalid || undefined}
          placeholder={t("accountNoPlaceholder")}
          onChange={(e) =>
            onChange({
              ...value,
              accountNo: e.target.value.replace(/[^\d ]/g, ""),
            })
          }
        />
        {noInvalid ? <FieldError>{t("accountNoInvalid")}</FieldError> : null}
      </Field>
      <Field data-invalid={nameInvalid || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-name`}>{t("accountName")}</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          autoComplete="off"
          value={value.accountName}
          aria-invalid={nameInvalid || undefined}
          placeholder={t("accountNamePlaceholder")}
          onChange={(e) => onChange({ ...value, accountName: e.target.value })}
        />
        {nameInvalid ? (
          <FieldError>{t("accountNameInvalid")}</FieldError>
        ) : (
          <FieldDescription>{t("accountNameHint")}</FieldDescription>
        )}
      </Field>
    </div>
  )
}

/** The manage-screen editor: shows the saved account and lets the owner change it. */
export function PayoutEditor({ initial }: { initial: PayoutDraft | null }) {
  const t = useTranslations("VenuePayout")
  const [draft, setDraft] = React.useState<PayoutDraft>(initial ?? EMPTY_PAYOUT)
  const [saving, setSaving] = React.useState(false)
  const valid = isPayoutValid(draft)

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    const result = await savePayout({
      bankBin: draft.bankBin,
      accountNo: normalizeAccountNo(draft.accountNo),
      accountName: toBankAccountName(draft.accountName),
    })
    setSaving(false)
    if (result.ok) toast.success(t("saved"))
    else toast.error(result.message)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("notice")}</p>
      <PayoutFields
        value={draft}
        onChange={setDraft}
        idPrefix="manage-payout"
      />
      <Button
        className="self-start rounded-full"
        disabled={!valid || saving}
        onClick={() => void save()}
      >
        {t("save")}
      </Button>
    </div>
  )
}
