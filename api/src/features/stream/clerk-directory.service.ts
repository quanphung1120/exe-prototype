import { Inject, Injectable, Logger } from "@nestjs/common"
import type { createClerkClient, User } from "@clerk/express"

export const CLERK_CLIENT = Symbol("CLERK_CLIENT")
export type ClerkBackendClient = ReturnType<typeof createClerkClient>

export interface DirectoryUser {
  id: string
  name: string
  image?: string
  /** Present only when the lookup was an exact-email query. */
  email?: string
}

/**
 * Read-only lookups against Clerk's user directory — the social graph behind
 * "find a real user to chat with". Never writes to Clerk. Name search must
 * never leak email addresses (enumeration/harvesting): only an exact-email
 * query echoes the email back on its results.
 */
@Injectable()
export class ClerkDirectoryService {
  private readonly logger = new Logger(ClerkDirectoryService.name)

  constructor(
    @Inject(CLERK_CLIENT) private readonly clerk: ClerkBackendClient
  ) {}

  /**
   * Find real users by name (partial) or email (exact) — the caller is
   * always filtered out of the results. Degrades to `[]` on a Clerk API
   * error rather than 500ing (search is a nice-to-have, not load-bearing).
   */
  async search(callerId: string, q: string): Promise<DirectoryUser[]> {
    const query = q.trim()
    if (!query) return []

    try {
      if (query.includes("@")) {
        const { data } = await this.clerk.users.getUserList({
          emailAddress: [query],
          limit: 5,
        })
        return data
          .filter((u) => u.id !== callerId)
          .map((u) => this.toDirectoryUser(u, query))
      }

      const { data } = await this.clerk.users.getUserList({
        query,
        limit: 8,
      })
      return data
        .filter((u) => u.id !== callerId)
        .map((u) => this.toDirectoryUser(u))
    } catch (err) {
      this.logger.error(
        `Clerk user search failed for query "${query}"`,
        err instanceof Error ? err.stack : String(err)
      )
      return []
    }
  }

  /** Look up several users by id at once (e.g. resolving a conversation's members). */
  async getMany(ids: string[]): Promise<DirectoryUser[]> {
    if (!ids.length) return []
    try {
      const { data } = await this.clerk.users.getUserList({
        userId: ids,
        limit: ids.length,
      })
      return data.map((u) => this.toDirectoryUser(u))
    } catch (err) {
      this.logger.error(
        `Clerk getMany lookup failed for ${ids.length} id(s)`,
        err instanceof Error ? err.stack : String(err)
      )
      return []
    }
  }

  /** Look up a single user by id, or null if missing/unreachable. */
  async getOne(id: string): Promise<DirectoryUser | null> {
    try {
      const user = await this.clerk.users.getUser(id)
      return this.toDirectoryUser(user)
    } catch (err) {
      this.logger.error(
        `Clerk getOne lookup failed for ${id}`,
        err instanceof Error ? err.stack : String(err)
      )
      return null
    }
  }

  /**
   * Map a Clerk `User` to our directory shape. Display name prefers first +
   * last name, falls back to the primary email's local part, then a
   * Vietnamese-first generic label. `email` is only attached when the caller
   * passes it in (i.e. this was resolved via an exact-email query).
   */
  private toDirectoryUser(user: User, exactEmail?: string): DirectoryUser {
    const fullName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim()
    const primaryEmail = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId
    )?.emailAddress
    const name = fullName || primaryEmail?.split("@")[0] || "Người chơi"

    return {
      id: user.id,
      name,
      ...(user.imageUrl ? { image: user.imageUrl } : {}),
      ...(exactEmail ? { email: exactEmail } : {}),
    }
  }
}
