// Seed a test account for signing into the dashboard.
// Run with `pnpm --filter api auth:seed`.
//
// Creates the user through Better Auth's server API so the password is hashed
// and the credential `account` row is created exactly as a real sign-up would,
// then marks the email verified so it can sign in straight away.
import { auth } from "../src/auth.js"
import { prisma } from "../src/db.js"

const TEST_EMAIL = "test@sportmatch.ai"
const TEST_PASSWORD = "password123"
const TEST_NAME = "Test Player"

const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } })

if (existing) {
  console.log(`ℹ️  Test user already exists (${TEST_EMAIL}) — skipping create.`)
} else {
  await auth.api.signUpEmail({
    body: { email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME },
  })
  console.log(`✅ Created test user ${TEST_EMAIL}`)
}

// Ensure the account can sign in regardless of email-verification settings.
await prisma.user.update({
  where: { email: TEST_EMAIL },
  data: { emailVerified: true },
})

console.log("\n🔑 Test login credentials:")
console.log(`   email:    ${TEST_EMAIL}`)
console.log(`   password: ${TEST_PASSWORD}\n`)

await prisma.$disconnect()
