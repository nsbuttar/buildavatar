import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import type { Provider } from "next-auth/providers";
import { z } from "zod";

import { ensureUser, upsertConnection } from "@avatar/core";

const credentialsSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

const providers: Provider[] = [
  Credentials({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      name: { label: "Name", type: "text" },
    },
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;
      const user = await ensureUser({
        email: parsed.data.email,
        name: parsed.data.name ?? parsed.data.email.split("@")[0],
      });
      return {
        id: user.id,
        email: user.email,
        name: user.name,
      };
    },
  }),
];

const devFallbackSecret =
  process.env.NODE_ENV === "production"
    ? undefined
    : "avatar-os-dev-secret-change-me";
const authSecret =
  process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? devFallbackSecret;

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: {
        params: {
          scope: "read:user user:email repo",
        },
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  providers,
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      const dbUser = await ensureUser({
        email: user.email,
        name: user.name,
        image: user.image,
      });
      if (account?.provider === "github" && account.access_token) {
        await upsertConnection({
          userId: dbUser.id,
          provider: "github",
          status: "connected",
          scopes: account.scope ? account.scope.split(" ") : [],
          tokens: {
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at ?? null,
          },
          metadata: {
            authLinkedAt: new Date().toISOString(),
          },
        });
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.email) {
        const dbUser = await ensureUser({
          email: user.email,
          name: user.name,
          image: user.image,
        });
        token.userId = dbUser.id;
      }
      if (account?.provider === "github" && account.access_token) {
        token.githubAccessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
