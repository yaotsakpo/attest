import { convexAuth } from "@convex-dev/auth/server";
import { EmailCode } from "./EmailCode";

// Passwordless email-code auth — no password to set, forget, or reset. A user
// enters their email, gets an 8-digit code, and enters it. The user lives in the
// `users` table (from authTables) and we issue a session. We derive the user
// server-side via getAuthUserId(ctx) everywhere; we never accept a userId as a
// function argument for authorization.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [EmailCode],
});
