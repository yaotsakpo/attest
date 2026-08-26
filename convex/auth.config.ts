// Convex Auth issues its own JWTs; the issuer is this deployment's site URL.
// CONVEX_SITE_URL is provided by the platform. Without this file,
// ctx.auth.getUserIdentity() always returns null.

// `process.env` is available at Convex runtime; declare it so the editor
// typechecks without pulling "node" into the tsconfig `types` allowlist
// (which the Convex guidelines warn against).
declare const process: { env: Record<string, string | undefined> };

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
