"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "@/i18n/navigation"
import { formatVndFull } from "@/features/dashboard/data"
import { submitSepayCheckoutForm } from "@/features/play/session"
import { savePreferredLocale } from "@/lib/locale-preference"
import {
  TOPUP_MAX,
  TOPUP_MIN,
  TOPUP_PRESETS,
  type WalletSummary,
  type WalletTransaction,
  type WithdrawalRow,
} from "@/lib/shared"
import { createTopUp, getTopUp } from "@/features/wallet/wallet-actions"
import { WithdrawSection } from "@/features/wallet/withdraw-form"

const POLL_MS = 2500
const TIMEOUT_MS = 2 * 60 * 1000

type ReturnState = "checking" | "paid" | "failed" | "cancelled" | "timeout"

const TX_ICON = {
  topup: ArrowDownLeft,
  refund: RotateCcw,
  payment: ArrowUpRight,
  share: Users,
  withdrawal: Banknote,
} as const

/**
 * The player's wallet: balance, a SePay top-up form and the ledger. Also the
 * landing page SePay sends the player back to (`?topup=<invoice>`), where it
 * polls the order until the IPN (or the API's own reconciliation) credits it.
 */
export function WalletView({
  wallet,
  withdrawals,
}: {
  wallet: WalletSummary
  withdrawals: WithdrawalRow[]
}) {
  const t = useTranslations("Wallet")
  const locale = useLocale()
  const router = useRouter()
  const params = useSearchParams()
  const topupId = params.get("topup")
  const returnStatus = params.get("status")

  const [amount, setAmount] = React.useState<number>(TOPUP_PRESETS[1])
  const [custom, setCustom] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [returned, setReturned] = React.useState<ReturnState | null>(null)

  const valid =
    Number.isInteger(amount) && amount >= TOPUP_MIN && amount <= TOPUP_MAX

  // Back from SePay: confirm the order, then refresh the balance.
  React.useEffect(() => {
    if (!topupId) return
    if (returnStatus === "failed" || returnStatus === "cancelled") {
      const timer = setTimeout(() => setReturned(returnStatus), 0)
      return () => clearTimeout(timer)
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const startedAt = Date.now()
    const tick = async () => {
      const result = await getTopUp(topupId)
      if (cancelled) return
      if (result.ok && result.data.status === "paid") {
        setReturned("paid")
        router.refresh()
        return
      }
      if (Date.now() - startedAt > TIMEOUT_MS) {
        setReturned("timeout")
        return
      }
      setReturned("checking")
      timer = setTimeout(() => void tick(), POLL_MS)
    }
    timer = setTimeout(() => void tick(), 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [topupId, returnStatus, router])

  const pickPreset = (value: number) => {
    setAmount(value)
    setCustom("")
  }

  const onCustom = (raw: string) => {
    const digits = raw.replace(/\D/g, "")
    setCustom(digits)
    setAmount(digits ? Number(digits) : 0)
  }

  const submit = () => {
    if (!valid || submitting) return
    setSubmitting(true)
    void (async () => {
      try {
        const result = await createTopUp(amount)
        if (!result.ok) {
          toast.error(t("topUpFailed"))
          setSubmitting(false)
          return
        }
        // SePay's return URL is a single static one — remember the locale so
        // the wallet page comes back in the player's language.
        savePreferredLocale(locale)
        submitSepayCheckoutForm(result.data.fields, result.data.checkoutUrl)
      } catch (err) {
        console.error("Top-up checkout failed", err)
        toast.error(t("topUpFailed"))
        setSubmitting(false)
      }
    })()
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {returned ? <ReturnBanner state={returned} t={t} /> : null}

      <section className="flex items-center gap-4 rounded-3xl bg-[#2046ed] p-6 text-white">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-white/15">
          <Wallet className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white/80">{t("balance")}</p>
          <p className="text-3xl font-semibold tabular-nums">
            {formatVndFull(wallet.balance)}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5">
        <h2 className="text-base font-semibold">{t("topUpTitle")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TOPUP_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => pickPreset(preset)}
              aria-pressed={!custom && amount === preset}
              className={cn(
                "rounded-2xl border px-3 py-3 text-sm font-medium tabular-nums transition-colors",
                !custom && amount === preset
                  ? "border-[#2046ed] bg-[#2046ed]/10 text-[#2046ed]"
                  : "hover:bg-muted"
              )}
            >
              {formatVndFull(preset)}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="topup-custom"
            className="text-sm text-muted-foreground"
          >
            {t("customAmount")}
          </label>
          <Input
            id="topup-custom"
            inputMode="numeric"
            placeholder={t("customPlaceholder")}
            value={custom ? Number(custom).toLocaleString("vi-VN") : ""}
            onChange={(e) => onCustom(e.target.value)}
          />
          <p
            className={cn(
              "text-xs",
              amount > 0 && !valid
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {t("limits", {
              min: formatVndFull(TOPUP_MIN),
              max: formatVndFull(TOPUP_MAX),
            })}
          </p>
        </div>
        <Button
          size="lg"
          disabled={!valid || submitting}
          onClick={submit}
          className="w-full sm:w-auto sm:self-start"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("redirecting")}
            </>
          ) : (
            <>
              <Plus className="size-4" />
              {t("topUpButton", { amount: formatVndFull(valid ? amount : 0) })}
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">{t("note")}</p>
      </section>

      <WithdrawSection balance={wallet.balance} withdrawals={withdrawals} />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t("history")}</h2>
        {wallet.transactions.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-3xl border bg-card">
            {wallet.transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const Icon = TX_ICON[tx.kind]
  const credit = tx.amount > 0
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          credit
            ? "bg-emerald-500/10 text-emerald-600"
            : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tx.note}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {tx.at.slice(8, 10)}/{tx.at.slice(5, 7)}/{tx.at.slice(0, 4)} ·{" "}
          {tx.at.slice(11, 16)}
        </p>
      </div>
      <p
        className={cn(
          "text-right text-sm font-semibold tabular-nums",
          credit ? "text-emerald-600" : "text-foreground"
        )}
      >
        {credit ? "+" : "−"}
        {formatVndFull(Math.abs(tx.amount))}
      </p>
    </li>
  )
}

function ReturnBanner({
  state,
  t,
}: {
  state: ReturnState
  t: ReturnType<typeof useTranslations>
}) {
  const ok = state === "paid"
  const waiting = state === "checking"
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm",
        ok
          ? "bg-emerald-500/10 text-emerald-700"
          : waiting
            ? "bg-muted text-muted-foreground"
            : "bg-destructive/10 text-destructive"
      )}
    >
      {ok ? (
        <Check className="size-4 shrink-0" />
      ) : waiting ? (
        <Loader2 className="size-4 shrink-0 animate-spin" />
      ) : (
        <TriangleAlert className="size-4 shrink-0" />
      )}
      <span>{t(`return.${state}`)}</span>
    </div>
  )
}
