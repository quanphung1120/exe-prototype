import { Resend } from "resend"

// Resend client. If RESEND_API_KEY is unset (e.g. local dev before secrets are
// wired), we fall back to logging the email to the console so auth flows still
// work end-to-end without sending real mail.
const apiKey = process.env.RESEND_API_KEY
const resend = apiKey ? new Resend(apiKey) : null

// The verified sender. With a real Resend account use a sender on a domain you
// own; `onboarding@resend.dev` works out of the box for testing.
const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "SportMatch AI <onboarding@resend.dev>"

type SendEmailArgs = {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendEmail({ to, subject, text, html }: SendEmailArgs) {
  if (!resend) {
    console.log(
      `\n[email:mock] no RESEND_API_KEY set — would send to ${to}\n  subject: ${subject}\n  ${text}\n`
    )
    return
  }

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  })

  if (error) {
    // Surface the failure so the auth flow can react, but don't crash the server.
    console.error(`[email] failed to send to ${to}:`, error)
    throw new Error(`Failed to send email: ${error.message}`)
  }
}
