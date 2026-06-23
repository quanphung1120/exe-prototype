import { createAuthClient } from "better-auth/react"

// Better Auth lives on the Hono API (a different origin than the web app), so
// the client points at that origin and must send credentials cross-origin for
// the session cookie to flow. The browser needs a public URL here.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:6969",
  fetchOptions: {
    credentials: "include",
  },
})

export const { signIn, signUp, signOut, useSession, getSession } = authClient
