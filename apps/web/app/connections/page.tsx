import { ConnectionsPanel } from "@/components/connections-panel";
import { requirePageAuth } from "@/lib/page-auth";

export default async function ConnectionsPage() {
  await requirePageAuth();
  return <ConnectionsPanel />;
}
