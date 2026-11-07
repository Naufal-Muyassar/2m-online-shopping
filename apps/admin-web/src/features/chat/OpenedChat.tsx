import type { ChatOpenRequest } from "@2m/shared";
import { errorMessage } from "../../lib/api";
import { ChatPane } from "./ChatPane";
import { useOpenedThread } from "./hooks";

// Opens the conversation (or finds the existing one) and shows it, so a chat can start from nothing.
export function OpenedChat({ input }: { input: ChatOpenRequest }) {
  const thread = useOpenedThread(input);
  if (thread.isError) {
    return (
      <p className="alert-box" role="alert">
        {errorMessage(thread.error)}
      </p>
    );
  }
  if (!thread.data) return <div className="skeleton h-24" role="status" aria-busy="true" aria-label="Memuat" />;
  return <ChatPane threadId={thread.data.id} />;
}
