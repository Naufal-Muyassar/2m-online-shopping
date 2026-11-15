import { useNavigate } from "react-router-dom";
import { errorMessage } from "../../lib/api";
import { useChatThreads, useOpenChat } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { IconChat } from "../../components/Icons";

// Opens (or reuses) the customer-courier chat of this order. Shown in the order header and in the tracking panel.
export function CourierChatButton({
  orderId,
  label,
  className,
}: {
  orderId: string;
  label: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const open = useOpenChat();
  const unread = useChatThreads("customer_courier").data?.find((t) => t.order_id === orderId)?.unread_count ?? 0;

  return (
    <button
      type="button"
      disabled={open.isPending}
      onClick={() =>
        open.mutate(
          { channel: "customer_courier", order_id: orderId },
          { onSuccess: (t) => navigate(`/chat/${t.id}`), onError: (e) => toast("error", errorMessage(e)) },
        )
      }
      className={cn("btn btn-secondary", className)}
    >
      <IconChat className="text-lg" />
      {label}
      {unread > 0 && <span className="count-badge static">{unread}</span>}
    </button>
  );
}
