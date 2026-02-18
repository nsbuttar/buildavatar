import { AdminPanel } from "@/components/admin-panel";
import { requirePageAuth } from "@/lib/page-auth";

export default async function AdminPage() {
  await requirePageAuth();
  return <AdminPanel />;
}
