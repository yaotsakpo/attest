import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

// Email + password auth — the fewest moving parts for the demo. The Password
// provider stores a user in the `users` table (from authTables) and issues a
// session. We derive the user server-side via getAuthUserId(ctx) everywhere;
// we never accept a userId as a function argument for authorization.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
