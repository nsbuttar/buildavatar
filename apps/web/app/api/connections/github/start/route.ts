import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { withApiGuard } from "@/lib/api";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async () => {
    const cookieStore = await cookies();
    const state = randomUUID();
    cookieStore.set("github_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    const clientId =
      process.env.GITHUB_CONNECT_CLIENT_ID ?? process.env.AUTH_GITHUB_ID;
    if (!clientId) {
      return NextResponse.json(
        {
          error:
            "Missing GITHUB_CONNECT_CLIENT_ID (or AUTH_GITHUB_ID) environment variable",
        },
        { status: 500 },
      );
    }
    const callbackUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/connections/github/callback`;
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: "read:user repo",
      state,
      allow_signup: "false",
    });
    return NextResponse.redirect(`https://github.com/login/oauth/authorize?${query.toString()}`);
  });
}

