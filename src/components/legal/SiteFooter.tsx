import Link from "next/link";

const LINKS = [
  { href: "/cgu", label: "Conditions d'utilisation" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/compte", label: "Mon compte" },
];

/**
 * Rendu dans le layout racine : les mentions légales doivent être joignables
 * depuis n'importe quelle page, y compris les parcours authentifiés.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.07] px-4 py-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} Matripa — plateforme de mise en relation réservée aux
          adultes consentants.
        </p>

        <nav aria-label="Informations légales" className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs text-slate-400 underline-offset-2 transition hover:text-white hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
