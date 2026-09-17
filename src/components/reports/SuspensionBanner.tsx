import { ShieldAlert } from "lucide-react";

import { suspensionMessage } from "@/lib/reports";

/** Profils suspendus après un signalement : ni motif ni signaleur ne sont révélés. */
export function SuspensionBanner({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
    >
      <ShieldAlert className="size-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{suspensionMessage(count)}</p>
    </div>
  );
}
