import { ChatClient } from "@/components/chat-client";
import { requirePageAuth } from "@/lib/page-auth";

export default async function ChatPage() {
  await requirePageAuth();
  return <ChatClient />;
}
