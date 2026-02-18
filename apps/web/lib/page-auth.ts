import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function requirePageAuth(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
}

