"use client"

import * as React from "react"
import { toast } from "sonner"

/**
 * State machine behind every admin action confirmed via `ReasonDialog`
 * (reject/settle/cancel): one target row, one reason/ref string, one busy
 * flag guarding re-entrant confirms, and the success/error/reset flow.
 * `onSuccess` lets a caller layer its own effect (e.g. approvals' optimistic
 * row removal) on top of the shared plumbing.
 */
export function useReasonConfirm<T>(
  action: (target: T, reason: string) => Promise<unknown>,
  onSuccess?: (target: T) => void
) {
  const [target, setTarget] = React.useState<T | null>(null)
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const confirm = async () => {
    if (!target || busy) return
    setBusy(true)
    try {
      await action(target, reason)
      onSuccess?.(target)
      setTarget(null)
      setReason("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setBusy(false)
    }
  }

  return {
    target,
    setTarget,
    busy,
    dialogProps: {
      open: target !== null,
      onOpenChange: (open: boolean) => {
        if (!open) {
          setTarget(null)
          setReason("")
        }
      },
      reason,
      onReasonChange: setReason,
      onConfirm: () => void confirm(),
    },
  }
}
