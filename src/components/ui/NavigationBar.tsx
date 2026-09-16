import Link from "next/link";
import { Inter } from "next/font/google";

// Navigation bar component – premium dark mode with gold/neon accents
export function NavigationBar() {
  return (
    <nav className="sticky top-0 z-20 flex items-center justify-between bg-surface/90 backdrop-blur-md border-b border-white/10 px-4 py-2 sm:px-6 lg:px-8">
      <Link href="/" className="font-display text-xl font-semibold text-white hover:text-gold transition-colors">
        Matripa
      </Link>
      <ul className="flex space-x-4 text-sm font-medium">
        <li>
          <Link href="/" className="text-slate-300 hover:text-white transition-colors">
            Accueil
          </Link>
        </li>
        <li>
          <Link href="/annonces" className="text-slate-300 hover:text-white transition-colors">
            Annonces
          </Link>
        </li>
        <li>
          <Link href="/pass-vip" className="flex items-center gap-1 text-slate-300 hover:text-neon transition-colors">
            <span className="bg-neon-action rounded-full px-2 py-0.5 text-xs text-white">VIP</span>
            Pass
          </Link>
        </li>
        <li>
          <Link href="/contact" className="text-slate-300 hover:text-white transition-colors">
            Contact
          </Link>
        </li>
      </ul>
    </nav>
  );
}
