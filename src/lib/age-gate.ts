/**
 * Confirmation de majorité à l'entrée du site.
 *
 * Mémorisée sur l'appareil (localStorage), comme les favoris : aucune donnée
 * n'est envoyée au serveur. L'écran est rendu dès le HTML serveur — un
 * visiteur non confirmé ne voit jamais le catalogue, même avant l'exécution du
 * JavaScript — et un script en tête de page le masque avant le premier
 * affichage pour qui a déjà confirmé, sans clignotement.
 */

export const AGE_GATE_KEY = "matripa:majeur";

/** Pages consultables sans confirmation : les conditions doivent pouvoir être lues avant d'accepter. */
const EXEMPT_PATHS = ["/cgu", "/confidentialite", "/mentions-legales"];

export const isAgeGateExempt = (pathname: string): boolean => EXEMPT_PATHS.includes(pathname);

/** Exécuté dans le <head>, avant l'affichage : pose `data-majeur` sur <html> si l'âge est déjà confirmé. */
export const AGE_GATE_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(AGE_GATE_KEY)})==="1")document.documentElement.dataset.majeur="1"}catch(e){}`;
