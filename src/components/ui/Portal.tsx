"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Monte ses enfants directement sous `<body>`.
 *
 * Indispensable ici : `position: fixed` se cale sur le *bloc conteneur*, et
 * tout ancêtre portant `transform`, `filter` ou `backdrop-filter` en devient
 * un. Or l'interface est faite de verre dépoli — la barre de filtres, le
 * panneau de réservation et les cartes portent tous `backdrop-blur`. Sans
 * portail, une modale « plein écran » se retrouve confinée à la boîte de son
 * parent flouté, voile compris.
 *
 * L'état `mounted` évite une divergence d'hydratation : `document` n'existe
 * pas au rendu serveur.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
