import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-slate-100">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-gold/15 to-neon/20 ring-1 ring-white/10">
          <Compass className="size-7 text-gold" aria-hidden />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Page introuvable</h1>
          <p className="text-sm leading-relaxed text-slate-400">
            Ce profil a peut-être été retiré ou son adresse a changé.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-xl bg-action px-6 text-sm font-semibold text-slate-950 shadow-[0_8px_30px_-10px_rgb(233_200_119/0.55)] transition hover:brightness-110"
        >
          Explorer les profils
        </Link>
      </div>
    </main>
  );
}
