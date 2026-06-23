import "server-only"

import { currentUser } from "@clerk/nextjs/server"

// The authenticated user, normalized to the minimal shape the dashboard needs.
// Clerk owns the source of truth; we map its `currentUser()` into this.
export type AuthUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
}

/**
 * Read the current auth session server-side via Clerk's `currentUser()`.
 *
 * Returns `null` when there is no signed-in user.
 */
export async function getServerSession(): Promise<{ user: AuthUser } | null> {
  const user = await currentUser()
  if (!user) return null

  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    ""

  return {
    user: {
      id: user.id,
      name: user.fullName || user.firstName || user.username || email,
      email,
      // Clerk only surfaces verified primary emails on the server user.
      emailVerified: true,
      image: user.imageUrl ?? null,
    },
  }
}
