import Link from "next/link";

import { auth, signOut } from "@/auth";

const nav = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/connections", label: "Connections" },
  { href: "/file-drop", label: "File Drop" },
  { href: "/chat", label: "Chat" },
  { href: "/memory-vault", label: "Memory Vault" },
  { href: "/admin", label: "Admin / Logs" },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    return <div className="min-h-screen">{children}</div>;
  }
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-[var(--brand)]">
              AVATAR OS
            </p>
            <p className="text-sm text-[var(--muted)]">
              AI-generated avatar. Not a human impersonation.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span>{session?.user?.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--bg)]"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[230px_1fr]">
        <aside className="card p-4">
          <nav className="space-y-2">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--fg)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
