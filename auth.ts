import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import Google from "next-auth/providers/google";

const allowedDomain = (process.env.COLLEGE_EMAIL_DOMAIN ?? "spjimr.org").trim().toLowerCase();

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      authorization: {
        params: {
          hd: allowedDomain,
          prompt: "select_account",
        },
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ account, user, profile }) {
      if (account?.provider !== "google" || !user.email || !profile) return false;

      const email = user.email.trim().toLowerCase();
      const googleProfile = profile as typeof profile & {
        email_verified?: boolean;
        hd?: string;
      };
      const hostedDomain = googleProfile.hd?.trim().toLowerCase();

      return (
        googleProfile.email_verified === true &&
        email.endsWith(`@${allowedDomain}`) &&
        hostedDomain === allowedDomain
      );
    },
  },
};

export async function auth() {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    // A browser can retain a JWT encrypted with an older local/deployment
    // secret. Treat that cookie as signed out so public pages still load.
    const details = error instanceof Error
      ? `${error.name} ${error.message}`
      : String(error);
    if (/JWT_SESSION_ERROR|decryption operation failed/i.test(details)) return null;
    throw error;
  }
}
