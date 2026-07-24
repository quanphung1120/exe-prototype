"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Search, X } from "lucide-react"

import { initialsOf } from "@/lib/shared"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useRouter } from "@/i18n/navigation"
import {
  createConversation,
  searchUsers,
  type FoundUser,
} from "@/features/chat/stream-actions"

const SEARCH_DEBOUNCE_MS = 350
const MIN_QUERY_LEN = 3

/**
 * "New chat" dialog: search real users by name/email, pick one for a DM or
 * several for a named group, then start the conversation and deep-link into
 * it. Search is debounced client-side; the api itself only accepts queries
 * >= 3 chars (see `UserSearchQueryDto`).
 */
export function NewChatDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Chat")
  const router = useRouter()

  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<FoundUser[]>([])
  const [selected, setSelected] = React.useState<FoundUser[]>([])
  const [groupName, setGroupName] = React.useState("")
  const [searching, setSearching] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  // Reset local state on close — done from the Dialog's own onOpenChange
  // handler (an event callback), not an effect, per the repo's "no sync
  // setState in an effect" rule.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("")
      setResults([])
      setSelected([])
      setGroupName("")
      setSearching(false)
      setCreating(false)
    }
    onOpenChange(next)
  }

  React.useEffect(() => {
    const trimmed = query.trim()
    let cancelled = false

    // Everything — including the "too short, clear results" branch — runs
    // inside the deferred timer callback so the effect body itself never
    // calls a setter synchronously.
    const timer = setTimeout(() => {
      if (cancelled) return
      if (trimmed.length < MIN_QUERY_LEN) {
        setResults([])
        setSearching(false)
        return
      }
      setSearching(true)
      searchUsers(trimmed)
        .then((found) => {
          if (cancelled) return
          setResults(found)
          setSearching(false)
        })
        .catch(() => {
          if (cancelled) return
          setResults([])
          setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const toggleSelected = (user: FoundUser) => {
    setSelected((current) =>
      current.some((u) => u.id === user.id)
        ? current.filter((u) => u.id !== user.id)
        : [...current, user]
    )
  }

  const isGroup = selected.length > 1
  const canSubmit =
    selected.length > 0 && (!isGroup || groupName.trim().length > 0)

  const submit = () => {
    if (!canSubmit || creating) return
    setCreating(true)
    createConversation({
      memberIds: selected.map((u) => u.id),
      name: isGroup ? groupName.trim() : undefined,
    })
      .then(({ id }) => {
        handleOpenChange(false)
        router.push(`/dashboard/chat?channel=${id}`)
      })
      .catch(() => {
        setCreating(false)
        toast.error(t("createFailed"))
      })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newChat")}</DialogTitle>
          <DialogDescription>{t("searchPlaceholder")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleSelected(u)}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pr-1.5 pl-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
                >
                  {u.name}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          ) : null}

          {isGroup ? (
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t("groupNamePlaceholder")}
              maxLength={80}
            />
          ) : null}

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {query.trim().length < MIN_QUERY_LEN ? (
              <p className="p-3 text-center text-xs text-muted-foreground">
                {t("searchHint")}
              </p>
            ) : searching ? (
              Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="size-9 rounded-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))
            ) : results.length === 0 ? (
              <p className="p-3 text-center text-xs text-muted-foreground">
                {t("noResults")}
              </p>
            ) : (
              results.map((u) => {
                const active = selected.some((s) => s.id === u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleSelected(u)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl p-2 text-left transition-colors",
                      active ? "bg-secondary/60" : "hover:bg-muted/40"
                    )}
                  >
                    <Avatar>
                      {u.image ? <AvatarImage src={u.image} alt="" /> : null}
                      <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                        {initialsOf(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.name}</p>
                      {u.email ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {u.email}
                        </p>
                      ) : null}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            className="rounded-full"
            disabled={!canSubmit || creating}
            onClick={submit}
          >
            {creating ? (
              <>
                <Loader2 className="animate-spin" />
                {t("creating")}
              </>
            ) : (
              t("create")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
