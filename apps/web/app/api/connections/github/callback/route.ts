import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  appendAuditLog,
  connectionSyncQueue,
  isLiteRuntime,
  updateConnectionSyncState,
  upsertConnection,
} from "@avatar/core";

import { connectors, ingestionService } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieStore = await cookies();
    const expectedState = cookieStore.get("github_oauth_state")?.value;
    cookieStore.delete("github_oauth_state");

    if (!code || !state || !expectedState || state !== expectedState) {
      return NextResponse.redirect(new URL("/connections?error=invalid_github_state", request.url));
    }

    const clientId =
      process.env.GITHUB_CONNECT_CLIENT_ID ?? process.env.AUTH_GITHUB_ID;
    const clientSecret =
      process.env.GITHUB_CONNECT_CLIENT_SECRET ?? process.env.AUTH_GITHUB_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL("/connections?error=missing_github_env", request.url));
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    if (!tokenResponse.ok) {
      return NextResponse.redirect(new URL("/connections?error=token_exchange_failed", request.url));
    }
    const payload = (await tokenResponse.json()) as GitHubTokenResponse;
    if (!payload.access_token) {
      return NextResponse.redirect(new URL("/connections?error=missing_access_token", request.url));
    }

    const connection = await upsertConnection({
      userId,
      provider: "github",
      status: "connected",
      scopes: payload.scope?.split(",") ?? ["repo", "read:user"],
      tokens: {
        accessToken: payload.access_token,
      },
    });
    if (isLiteRuntime()) {
      await updateConnectionSyncState({
        connectionId: connection.id,
        status: "pending",
      });
      try {
        await ingestionService.syncConnection({
          userId,
          connectionId: connection.id,
          connector: connectors.github,
        });
        await updateConnectionSyncState({
          connectionId: connection.id,
          status: "connected",
        });
      } catch (error) {
        await updateConnectionSyncState({
          connectionId: connection.id,
          status: "error",
        });
        throw error;
      }
    } else {
      await connectionSyncQueue.add(
        `sync-github-${connection.id}`,
        {
          userId,
          provider: "github",
          connectionId: connection.id,
        },
        {
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      );
    }
    await appendAuditLog(null, {
      userId,
      action: "connection.github_oauth_connected",
      objectType: "connection",
      objectId: connection.id,
      details: {},
    });
    return NextResponse.redirect(new URL("/connections?status=github_connected", request.url));
  });
}

