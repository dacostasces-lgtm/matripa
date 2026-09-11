"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/report-error";

/**
 * Dernier filet : `error.tsx` ne couvre pas les erreurs survenues dans le
 * layout racine. Sans ce fichier, une telle erreur affiche la page blanche par
 * défaut de Next, sans aucun signalement.
 *
 * Il remplace `<html>` et `<body>` : ni la police ni les styles globaux ne
 * sont chargés à ce stade, d'où les styles en ligne.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, "global");
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#020617",
          color: "#e2e8f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#fff" }}>
            Une erreur est survenue
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#94a3b8" }}>
            L&apos;application n&apos;a pas pu se charger. Réessayez dans un instant.
          </p>
          {error.digest && (
            <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#475569" }}>
              Référence : {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              height: "2.75rem",
              padding: "0 1.5rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#e11d6a",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
