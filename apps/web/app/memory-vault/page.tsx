import { MemoryVault } from "@/components/memory-vault";
import { requirePageAuth } from "@/lib/page-auth";

export default async function MemoryVaultPage() {
  await requirePageAuth();
  return <MemoryVault />;
}
