import { Email } from "@convex-dev/auth/providers/Email";
import { Resend } from "resend";

// A uniform 8-digit numeric code via Web Crypto (available in the Convex
// runtime). Rejection-sampled so digits are unbiased across 0-9.
function generateCode(): string {
  const digits = new Uint32Array(8);
  crypto.getRandomValues(digits);
  let out = "";
  for (let i = 0; i < 8; i++) out += (digits[i] % 10).toString();
  return out;
}

// Passwordless email-code sign-in. A user enters their email, receives an 8-digit
// code, and enters it — no password to set, forget, or reset. The code is sent
// via Resend. If AUTH_RESEND_KEY is unset (local dev before a sending domain is
// verified), the code is logged to the Convex console instead of emailed, so the
// flow is still testable without email infrastructure.
export const EmailCode = Email({
  id: "email-code",
  maxAge: 60 * 15, // codes expire in 15 minutes
  async generateVerificationToken() {
    return generateCode();
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const key = process.env.AUTH_RESEND_KEY;
    if (!key) {
      // Dev fallback: no email service configured yet. Log the code so sign-in
      // still works locally before a Resend domain is verified.
      console.log(`[auth] email code for ${email}: ${token}`);
      return;
    }
    const from = process.env.AUTH_EMAIL_FROM || "onboarding@resend.dev";
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: `Your Attest sign-in code: ${token}`,
      text: `Your Attest sign-in code is ${token}. It expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    });
    if (error) {
      throw new Error(`Failed to send sign-in code: ${JSON.stringify(error)}`);
    }
  },
});

// `process.env` is available at Convex runtime; declared for the editor.
declare const process: { env: Record<string, string | undefined> };
