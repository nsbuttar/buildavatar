import { FileDropPanel } from "@/components/file-drop-panel";
import { requirePageAuth } from "@/lib/page-auth";

export default async function FileDropPage() {
  await requirePageAuth();
  return <FileDropPanel />;
}
