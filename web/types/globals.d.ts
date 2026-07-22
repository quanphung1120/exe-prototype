// RBAC (https://clerk.com/docs/guides/secure/basic-rbac): the role lives in
// Clerk `publicMetadata`, set manually in the Clerk dashboard — no app code
// grants it. This augmentation just gives `user.publicMetadata.role` and
// `sessionClaims.metadata.role` a type instead of `unknown`.
export type Roles = "admin"

declare global {
  interface UserPublicMetadata {
    role?: Roles
  }

  interface CustomJwtSessionClaims {
    metadata?: {
      role?: Roles
    }
  }
}
