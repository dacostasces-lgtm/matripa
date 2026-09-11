import { WifiOff } from "lucide-react";

import { ReloadButton } from "@/components/pwa/ReloadButton";

export const metadata = {
  title: "Hors ligne",
  robots: { index: false, follow: false },
};

/**
 * Page de repli servie par le service worker quand le réseau est indisponible.
 * Statique par construction : elle doit pouvoir être précachée à l'install.
 */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-slate-100">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
          <WifiOff className="size-7 text-slate-400" aria-hidden />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Vous êtes hors ligne</h1>
          <p className="text-sm leading-relaxed text-slate-400">
            Les offres déjà consultées restent accessibles. Reconnectez-vous pour parcourir le
            catalogue complet et envoyer une demande.
          </p>
        </div>

        <ReloadButton />
      </div>
    </main>
  );
}
