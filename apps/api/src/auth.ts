import "dotenv/config"

import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"

import { prisma } from "./db.js"
import { sendEmail } from "./email.js"

// Where the Next.js web app lives — used for CSRF trustedOrigins and as the base
// for links inside verification / reset emails when the client doesn't pass one.
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

// In production the web app and this API run on two subdomains of the same
// registrable domain (e.g. exe-prototype-web / exe-prototype-api .quanphungg.me).
// Set COOKIE_DOMAIN to the shared parent (".quanphungg.me") so the session cookie
// is scoped there and the browser also sends it to the web origin — otherwise the
// cookie is host-only on this API host and the web app's server-side dashboard
// guard never sees it. Leave unset in dev: web (:3000) and API (:6969) share the
// host "localhost" (cookies ignore port), so a host-only cookie already reaches
// both.
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN

export const auth = betterAuth({
  appName: "SportMatch AI",

  // BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment.
  // BETTER_AUTH_URL must be this API's own origin (e.g. http://localhost:6969)
  // so OAuth redirect URIs resolve correctly.
  baseURL: process.env.BETTER_AUTH_URL,

  // The web app is served from a different origin (port) than this API, so it
  // must be whitelisted for CSRF/origin checks.
  trustedOrigins: [WEB_URL],

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    // Verification emails are sent on sign-up (below), but we don't hard-block
    // sign-in on them so the prototype works before Resend keys are wired. Flip
    // this to `true` (or gate on an env var) once real email delivery is set up.
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your SportMatch AI password",
        text: `Reset your password by visiting this link:\n\n${url}\n\nIf you didn't request this, you can safely ignore this email.`,
      })
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email · SportMatch AI",
        text: `Welcome to SportMatch AI! Confirm your email by visiting this link:\n\n${url}`,
      })
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  // Link a Google sign-in to an existing email/password account (and vice-versa)
  // when the verified email matches, so users aren't split into two accounts.
  account: {
    accountLinking: {
      enabled: true,
    },
  },

  // The web app and this API live on two subdomains of one registrable domain, so
  // they are *same-site*. Scoping the session cookie to the shared parent (via
  // COOKIE_DOMAIN) lets the browser send it to the web origin too, so the web
  // app's server-side dashboard guard can read it. SameSite=Lax is correct for
  // same-site subdomains and is sent on the top-level navigation to /dashboard;
  // None+Partitioned (CHIPS) would isolate the cookie and defeat the sharing.
  advanced: {
    ...(COOKIE_DOMAIN
      ? { crossSubDomainCookies: { enabled: true, domain: COOKIE_DOMAIN } }
      : {}),
    defaultCookieAttributes: { sameSite: "lax", secure: true },
  },
})

export type Session = typeof auth.$Infer.Session
