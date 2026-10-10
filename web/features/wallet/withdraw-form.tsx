"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Banknote, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "@/i18n/navigation"
import { formatVndFull } from "@/features/dashboard/data"
import { createWithdrawal } from "@/features/wallet/wallet-actions"
import {
  type WithdrawalRow,
  type WithdrawalStatus,
} from "@/lib/shared"

const STATUS_STYLE: Record<WithdrawalStatus, string> = {
  pending: "text-amber-600",
  completed: "text-emerald-600",
  rejected: "text-destructive",
}

/**
 * Withdraw wallet money back to a bank account. The amount leaves the wallet
 * at once; an admin then sends the transfer by hand (a rejected request puts
 * the money back).
 */
export function WithdrawSection({
  balance,
  withdrawals,
}: {
  balance: number
  withdrawals: WithdrawalRow[]
}) {
  const t = useTranslations("Wallet")
  const router = useRouter()
  const [amount, setAmount] = React.useState("")
  const [bankName, setBankName] = React.useState("")
  const [accountNumber, setAccountNumber] = React.useState("")
  const [accountHolder, setAccountHolder] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const value = Number(amount)
  const valid =
    Number.isInteger(value) &&
    value > 0 &&
    value <= balance &&
    bankName.trim().length >= 2 &&
    /^\d{6,20}$/.test(accountNumber) &&
    accountHolder.trim().length >= 2

  const submit = () => {
    if (!valid || busy) return
    setBusy(true)
    void (async () => {
      const result = await createWithdrawal({
        amount: value,
        bankName: bankName.trim(),
        accountNumber,
        accountHolder: accountHolder.trim().toUpperCase(),
      })
      setBusy(false)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(t("withdraw.sent"))
      setAmount("")
      router.refresh()
    })()
  }

  return (
    <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("withdraw.title")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("withdraw.note")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">{t("withdraw.amount")}</span>
          <Input
            inputMode="numeric"
            placeholder={t("withdraw.amountPlaceholder")}
            value={amount ? Number(amount).toLocaleString("vi-VN") : ""}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          />
          <span
            className={cn(
              "text-xs",
              value > balance ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {t("withdraw.available", { balance: formatVndFull(balance) })}
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">{t("withdraw.bank")}</span>
          <Input
            placeholder={t("withdraw.bankPlaceholder")}
            value={bankName}
            maxLength={60}
            onChange={(e) => setBankName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">
            {t("withdraw.accountNumber")}
          </span>
          <Input
            inputMode="numeric"
            value={accountNumber}
            maxLength={20}
            onChange={(e) =>
              setAccountNumber(e.target.value.replace(/\D/g, ""))
            }
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">
            {t("withdraw.accountHolder")}
          </span>
          <Input
            placeholder={t("withdraw.holderPlaceholder")}
            value={accountHolder}
            maxLength={80}
            onChange={(e) => setAccountHolder(e.target.value)}
          />
        </label>
      </div>
      <Button
        size="lg"
        disabled={!valid || busy}
        onClick={submit}
        className="w-full sm:w-auto sm:self-start"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Banknote />}
        {t("withdraw.submit")}
      </Button>

      {withdrawals.length ? (
        <ul className="flex flex-col divide-y rounded-2xl border">
          {withdrawals.map((w) => (
            <li
              key={w.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium tabular-nums">
                  {formatVndFull(w.amount)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {w.bankName} ••{w.accountNumber.slice(-4)} ·{" "}
                  {w.requestedAt.slice(8, 10)}/{w.requestedAt.slice(5, 7)}
                </p>
                {w.status === "rejected" && w.adminNote ? (
                  <p className="text-xs text-destructive">{w.adminNote}</p>
                ) : null}
                {w.status === "completed" && w.ref ? (
                  <p className="text-xs text-muted-foreground">
                    {t("withdraw.ref", { ref: w.ref })}
                  </p>
                ) : null}
              </div>
              <span
                className={cn("text-xs font-medium", STATUS_STYLE[w.status])}
              >
                {t(`withdraw.status.${w.status}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
