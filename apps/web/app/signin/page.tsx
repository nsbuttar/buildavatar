import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/chat");
  }
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/chat";

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-6">
      <div className="card w-full space-y-6 p-8">
        <div>
          <p className="label">Avatar OS</p>
          <h1 className="text-3xl font-semibold font-[var(--font-title)]">
            Sign in to your AI avatar
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This avatar is always labeled as AI-generated and privacy-first.
          </p>
        </div>

        <form
          className="space-y-3"
          action={async (formData) => {
            "use server";
            await signIn("credentials", {
              email: String(formData.get("email")),
              name: String(formData.get("name") ?? ""),
              redirectTo: callbackUrl,
            });
          }}
        >
          <input
            name="name"
            placeholder="Name (optional)"
            className="w-full rounded-xl border border-[var(--line)] px-3 py-2"
          />
          <input
            required
            name="email"
            type="email"
            placeholder="Email"
            className="w-full rounded-xl border border-[var(--line)] px-3 py-2"
          />
          <button
            className="w-full rounded-xl bg-[var(--brand)] px-4 py-2 font-medium text-white hover:bg-[var(--brand-strong)]"
            type="submit"
          >
            Continue
          </button>
        </form>

        {process.env.AUTH_GITHUB_ID ? (
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: callbackUrl });
            }}
          >
            <button
              className="w-full rounded-xl border border-[var(--line)] px-4 py-2 font-medium hover:bg-[var(--bg)]"
              type="submit"
            >
              Sign in with GitHub
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

