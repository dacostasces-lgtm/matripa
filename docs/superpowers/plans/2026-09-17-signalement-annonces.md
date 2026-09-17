# Signalement d'annonces — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** permettre aux comptes connectés de signaler une annonce, masquer immédiatement les annonces signalées pour un motif grave, alerter l'équipe par e-mail et donner aux administrateurs trois décisions (infondé, retrait, constat de minorité).

**Architecture :** les règles vivent en base (migration `0012`) : une table `listing_reports` sans écriture directe, une colonne `listings.suspended_at` intégrée à la visibilité publique, et des fonctions `SECURITY DEFINER` pour signaler, lister et trancher. L'application ajoute une page `/signaler/[slug]`, une section en tête de `/admin`, la pastille « Suspendu » côté partenaire et une alerte e-mail via Resend.

**Tech Stack :** Next.js 15 (App Router, Server Actions) · React 19 · Supabase (Postgres 17, RLS) · Tailwind v4 · Vitest · pgTAP · Playwright.

**Spec :** `docs/superpowers/specs/2026-09-17-signalement-annonces-design.md`

## Global Constraints

- Branche `feat/signalement-annonces`, basée sur `feat/verification-identite` ; worktree `.worktrees/signalement-annonces`. Ne jamais fusionner ni pousser vers `main`.
- Migration unique : `supabase/migrations/0012_listing_reports.sql` (la dernière existante est `0011_identity_verification.sql`).
- Motifs (enum `report_reason`) : `personne_mineure`, `contrainte_exploitation`, `faux_profil`, `arnaque`, `autre`. Urgents : `personne_mineure`, `contrainte_exploitation`.
- Statuts (enum `report_status`) : `open`, `confirmed`, `dismissed`. Décisions : `dismiss`, `remove`, `block_minor`.
- Précisions : 1 000 caractères maximum ; 10 caractères minimum pour `autre`. Note de décision : 300 caractères maximum, obligatoire pour `remove`.
- Anti-abus : un signalement ouvert par (compte, annonce) ; 5 signalements par heure par compte.
- Seuls les comptes connectés signalent. Aucun suivi pour le signaleur (il ne peut pas lire `status`).
- Alerte e-mail uniquement pour les motifs urgents, destinataires `REPORT_ALERT_EMAILS` (liste séparée par des virgules) ; ni identité du signaleur ni précisions dans l'e-mail.
- Tout type de ligne Supabase est un alias `type`, jamais une `interface` ; chaque table déclare `Relationships`.
- Un module `"use server"` n'exporte que des fonctions async ; états initiaux et constantes dans `src/lib/` ou `src/types/`.
- Toute table nouvelle accorde explicitement ses droits à `service_role`. PostgreSQL accorde EXECUTE à PUBLIC par défaut : chaque nouvelle fonction fait `revoke execute … from public, anon`.
- Libellés d'interface, commentaires et README en français.
- `git add` avec chemins explicites uniquement (jamais `-A` ni `.`). Chaque message de commit se termine exactement par `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Carte des fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/0012_listing_reports.sql` | Types, table, suspension, journal, fonctions |
| `supabase/tests/reports.test.sql` | Propriétés de sécurité du signalement |
| `src/types/reports.ts` | Motifs, libellés, décisions, gardes de type |
| `src/lib/reports.ts` (+ `.test.ts`) | Validation, messages d'erreur, états, destinataires |
| `src/types/database.ts` | Schéma typé |
| `src/lib/notifications.ts` | Envoi générique + `sendReportAlert` |
| `src/app/actions/reports.ts` | `submitReport`, `reviewReport` |
| `src/app/signaler/[slug]/page.tsx`, `src/components/reports/ReportForm.tsx` | Parcours de signalement |
| `src/app/annonces/[slug]/page.tsx`, `src/middleware.ts` | Lien d'entrée, session |
| `src/components/reports/SuspensionBanner.tsx`, `src/app/partenaire/page.tsx` | Côté partenaire |
| `src/app/api/mon-compte/export/route.ts`, `src/app/confidentialite/page.tsx` | Cycle de vie des données |
| `src/components/reports/AdminReportsSection.tsx`, `src/components/reports/ReportReview.tsx`, `src/app/admin/page.tsx` | Administration |
| `e2e/signalement.spec.ts` | Bout en bout |
| `README.md` | Documentation |

---

### Task 0 : Préparer le worktree (contrôleur)

**Files :** aucun (fichier `.env.local` ignoré par git).

- [ ] **Step 1 : Installer et configurer**

```bash
cd "/Users/groupelerepere/Documents/IDE MOOD/MATRIPA FINAL/.worktrees/signalement-annonces"
npm ci --no-audit --no-fund
cp ../verification-identite/.env.local .env.local
```

- [ ] **Step 2 : Ligne de base**

```bash
supabase status >/dev/null 2>&1 || supabase start
supabase db reset
npm run check
supabase test db
```

Expected : Vitest 67/67, pgTAP 90/90.

---

### Task 1 : Domaine et logique pure

**Files :**
- Create : `src/types/reports.ts`
- Create : `src/lib/reports.ts`
- Test : `src/lib/reports.test.ts`

**Interfaces :**
- Produces (`@/types/reports`) : `REPORT_REASONS`, `ReportReason`, `ReportStatus`, `ReportDecision`, `reportReason(slug)`, `isReportReason(v)`, `isReportDecision(v)`, `isUrgentReason(reason)`.
- Produces (`@/lib/reports`) : `MAX_REPORT_DETAILS`, `MIN_OTHER_DETAILS`, `MAX_RESOLUTION_NOTE`, `checkReportDetails(reason, details): string | null`, `reportErrorCode(message): ReportErrorCode | null`, `reportErrorMessage(message): string`, `suspensionMessage(count): string`, `parseAlertRecipients(value): string[]`, types `ReportFormState`, `ReviewReportState`, constantes `INITIAL_REPORT_STATE`, `INITIAL_REVIEW_REPORT_STATE`.

- [ ] **Step 1 : Écrire le domaine**

`src/types/reports.ts` :

```ts
/**
 * Domaine du signalement d'annonces.
 *
 * Les slugs reprennent à l'identique les enums Postgres de la migration 0012 ;
 * les libellés sont centralisés ici, comme ceux des annonces dans `listing.ts`.
 * Les motifs urgents sont placés en tête : c'est l'ordre d'affichage du
 * formulaire.
 */

export const REPORT_REASONS = [
  {
    slug: "personne_mineure",
    label: "Personne mineure présumée",
    help: "Le profil semble concerner une personne de moins de 18 ans.",
    urgent: true,
  },
  {
    slug: "contrainte_exploitation",
    label: "Contrainte ou exploitation",
    help: "La personne semble agir sous la contrainte, être contrôlée ou exploitée par un tiers.",
    urgent: true,
  },
  {
    slug: "faux_profil",
    label: "Faux profil ou photos volées",
    help: "Les photos ou l'identité appartiennent à quelqu'un d'autre.",
    urgent: false,
  },
  {
    slug: "arnaque",
    label: "Arnaque",
    help: "Demande d'argent à l'avance, escroquerie ou tentative de fraude.",
    urgent: false,
  },
  {
    slug: "autre",
    label: "Autre",
    help: "Précisez le problème ci-dessous.",
    urgent: false,
  },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["slug"];

export type ReportStatus = "open" | "confirmed" | "dismissed";

export type ReportDecision = "dismiss" | "remove" | "block_minor";

export const reportReason = (slug: string) =>
  REPORT_REASONS.find((reason) => reason.slug === slug) ?? null;

export const isReportReason = (v: unknown): v is ReportReason =>
  typeof v === "string" && REPORT_REASONS.some((reason) => reason.slug === v);

const DECISIONS: readonly ReportDecision[] = ["dismiss", "remove", "block_minor"];

export const isReportDecision = (v: unknown): v is ReportDecision =>
  typeof v === "string" && (DECISIONS as readonly string[]).includes(v);

export const isUrgentReason = (reason: ReportReason): boolean =>
  REPORT_REASONS.some((item) => item.slug === reason && item.urgent);
```

- [ ] **Step 2 : Écrire les tests (qui doivent échouer)**

`src/lib/reports.test.ts` :

```ts
import { describe, expect, it } from "vitest";

import {
  checkReportDetails,
  MAX_REPORT_DETAILS,
  parseAlertRecipients,
  reportErrorCode,
  reportErrorMessage,
  suspensionMessage,
} from "@/lib/reports";
import {
  isReportDecision,
  isReportReason,
  isUrgentReason,
  REPORT_REASONS,
  reportReason,
} from "@/types/reports";

describe("motifs", () => {
  it("place les deux motifs urgents en tête", () => {
    expect(REPORT_REASONS.slice(0, 2).every((reason) => reason.urgent)).toBe(true);
    expect(REPORT_REASONS.slice(2).some((reason) => reason.urgent)).toBe(false);
  });

  it("reconnaît les motifs urgents", () => {
    expect(isUrgentReason("personne_mineure")).toBe(true);
    expect(isUrgentReason("contrainte_exploitation")).toBe(true);
    expect(isUrgentReason("arnaque")).toBe(false);
  });

  it("valide les slugs de motif et de décision", () => {
    expect(isReportReason("autre")).toBe(true);
    expect(isReportReason("spam")).toBe(false);
    expect(isReportReason(undefined)).toBe(false);
    expect(isReportDecision("block_minor")).toBe(true);
    expect(isReportDecision("approve")).toBe(false);
  });

  it("fournit le libellé d'un motif", () => {
    expect(reportReason("faux_profil")?.label).toBe("Faux profil ou photos volées");
    expect(reportReason("inconnu")).toBeNull();
  });
});

describe("checkReportDetails", () => {
  it("accepte l'absence de précisions hors « Autre »", () => {
    expect(checkReportDetails("arnaque", "")).toBeNull();
  });

  it("exige 10 caractères utiles pour « Autre »", () => {
    expect(checkReportDetails("autre", "trop court")).toBeNull();
    expect(checkReportDetails("autre", "  court  ")).not.toBeNull();
  });

  it("plafonne les précisions à 1 000 caractères", () => {
    expect(checkReportDetails("arnaque", "a".repeat(MAX_REPORT_DETAILS))).toBeNull();
    expect(checkReportDetails("arnaque", "a".repeat(MAX_REPORT_DETAILS + 1))).not.toBeNull();
  });
});

describe("messages d'erreur", () => {
  it("traduit un code connu", () => {
    expect(reportErrorMessage("already_reported")).toContain("déjà signalé");
  });

  it("renvoie un message de repli pour une erreur inconnue", () => {
    expect(reportErrorMessage("boom")).toBe("Une erreur est survenue. Réessayez dans un instant.");
  });

  it("ne confond pas une propriété héritée avec un code", () => {
    expect(reportErrorCode("toString")).toBeNull();
    expect(reportErrorCode(undefined)).toBeNull();
  });
});

describe("suspensionMessage", () => {
  it("accorde au singulier et au pluriel", () => {
    expect(suspensionMessage(1)).toBe(
      "Un de vos profils est suspendu le temps d'un examen par l'équipe Matripa.",
    );
    expect(suspensionMessage(3)).toBe(
      "3 de vos profils sont suspendus le temps d'un examen par l'équipe Matripa.",
    );
  });
});

describe("parseAlertRecipients", () => {
  it("découpe et nettoie la liste", () => {
    expect(parseAlertRecipients(" a@x.cg, ,b@y.cg ")).toEqual(["a@x.cg", "b@y.cg"]);
  });

  it("écarte les valeurs qui ne sont pas des adresses", () => {
    expect(parseAlertRecipients("equipe, c@z.cg")).toEqual(["c@z.cg"]);
  });

  it("renvoie une liste vide sans configuration", () => {
    expect(parseAlertRecipients(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 3 : Vérifier l'échec**

Run : `npx vitest run src/lib/reports.test.ts`
Expected : FAIL — `Failed to resolve import "@/lib/reports"`.

- [ ] **Step 4 : Implémenter**

`src/lib/reports.ts` :

```ts
import type { ReportReason } from "@/types/reports";

/**
 * Logique pure du signalement, partagée entre le navigateur, les Server
 * Actions et les tests. Les limites reprennent celles de la migration 0012.
 */

export const MAX_REPORT_DETAILS = 1000;
export const MIN_OTHER_DETAILS = 10;
export const MAX_RESOLUTION_NOTE = 300;

/** Message d'erreur à afficher, ou `null` si les précisions sont acceptables. */
export function checkReportDetails(reason: ReportReason, details: string): string | null {
  const value = details.trim();

  if (value.length > MAX_REPORT_DETAILS) {
    return "Les précisions ne doivent pas dépasser 1 000 caractères.";
  }
  if (reason === "autre" && value.length < MIN_OTHER_DETAILS) {
    return "Précisez le problème en 10 caractères au moins.";
  }
  return null;
}

const ERROR_MESSAGES = {
  already_reported: "Vous avez déjà signalé ce profil. Il est en cours d'examen.",
  rate_limited: "Trop de signalements en peu de temps. Réessayez plus tard.",
  listing_unavailable: "Ce profil n'est plus disponible.",
  own_listing: "Vous ne pouvez pas signaler votre propre profil.",
  details_required: "Précisez le problème en 10 caractères au moins.",
  details_too_long: "Les précisions ne doivent pas dépasser 1 000 caractères.",
  invalid_reason: "Choisissez un motif.",
  note_required: "Indiquez une note pour retirer le profil.",
  already_reviewed: "Ce signalement a déjà été traité.",
  invalid_decision: "Décision invalide.",
  not_found: "Signalement introuvable. Rechargez la page.",
  forbidden: "Action non autorisée.",
} as const;

export type ReportErrorCode = keyof typeof ERROR_MESSAGES;

const FALLBACK_MESSAGE = "Une erreur est survenue. Réessayez dans un instant.";

/** PostgREST renvoie le texte du `raise exception` dans `error.message`. */
export function reportErrorCode(message: string | null | undefined): ReportErrorCode | null {
  if (!message) return null;
  const codes = Object.keys(ERROR_MESSAGES) as ReportErrorCode[];
  return codes.find((code) => message.includes(code)) ?? null;
}

export function reportErrorMessage(message: string | null | undefined): string {
  const code = reportErrorCode(message);
  return code ? ERROR_MESSAGES[code] : FALLBACK_MESSAGE;
}

/** Bandeau du tableau de bord : ni motif ni signaleur ne sont révélés. */
export function suspensionMessage(count: number): string {
  if (count === 1) {
    return "Un de vos profils est suspendu le temps d'un examen par l'équipe Matripa.";
  }
  return `${count} de vos profils sont suspendus le temps d'un examen par l'équipe Matripa.`;
}

/** `REPORT_ALERT_EMAILS` : adresses séparées par des virgules. */
export function parseAlertRecipients(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.includes("@"));
}

/** Hors du module `"use server"`, qui ne peut exporter que des fonctions async. */
export type ReportFormState = {
  status: "idle" | "success" | "error";
  urgent: boolean;
  message: string | null;
};

export const INITIAL_REPORT_STATE: ReportFormState = { status: "idle", urgent: false, message: null };

export type ReviewReportState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const INITIAL_REVIEW_REPORT_STATE: ReviewReportState = { status: "idle", message: null };
```

- [ ] **Step 5 : Vérifier le succès**

Run : `npx vitest run src/lib/reports.test.ts` puis `npm run check`
Expected : PASS ; `npm run check` vert (67 + nouveaux tests).

- [ ] **Step 6 : Commit**

```bash
git add src/types/reports.ts src/lib/reports.ts src/lib/reports.test.ts
git commit -m "feat(signalement): domaine et logique pure du signalement

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2 : Base de données — migration et tests pgTAP

**Files :**
- Create : `supabase/tests/reports.test.sql`
- Create : `supabase/migrations/0012_listing_reports.sql`

**Interfaces :**
- Produces (SQL) :
  - `public.submit_report(p_listing_id uuid, p_reason report_reason, p_details text) returns table (id uuid, is_urgent boolean, listing_title text, listing_city text)` — le retour inclut le titre et la ville pour l'alerte e-mail : une fois suspendue, l'annonce n'est plus lisible par le signaleur.
  - `public.review_report(p_report_id uuid, p_decision text, p_note text default null) returns void`
  - `public.admin_list_open_reports() returns table (id uuid, reason report_reason, is_urgent boolean, details text, created_at timestamptz, reporter_id uuid, owner_id uuid, listing_id uuid, listing_title text, listing_city text, listing_cover_url text, listing_description text, listing_status listing_status, listing_suspended_at timestamptz, listing_is_verified boolean, listing_grace_until timestamptz, open_reports_on_listing integer)`
  - Colonne `listings.suspended_at timestamptz`.
  - Erreurs : `forbidden`, `invalid_reason`, `listing_unavailable`, `own_listing`, `already_reported`, `rate_limited`, `details_required`, `details_too_long`, `invalid_decision`, `not_found`, `already_reviewed`, `note_required`.

- [ ] **Step 1 : Écrire les tests pgTAP (qui doivent échouer)**

`supabase/tests/reports.test.sql` :

```sql
-- Propriétés de sécurité du signalement d'annonces.
--
-- Exécution :  supabase test db     (nécessite `supabase start`)
--
-- Ce qui est verrouillé ici : on ne signale qu'avec un compte et jamais sa
-- propre annonce, un motif urgent masque immédiatement le profil, le
-- partenaire ne peut pas lever la suspension, le signaleur ne voit pas la
-- suite donnée, et chaque décision de l'équipe est tracée.

begin;
select plan(40);

-- Jeu d'essai ---------------------------------------------------------------
-- r1, r2, r3 : signaleurs · o1 : propriétaire vérifié · o2 : propriétaire
-- vérifié, bloqué en fin de fichier · adm : administrateur
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token,
  email_change, phone_change, email_confirmed_at, created_at, updated_at
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, 'x', '', '', '', '', '', '', '', '', now(), now(), now()
  from (values
    ('d0000000-0000-0000-0000-000000000001', 'rep-r1@test.cg'),
    ('d0000000-0000-0000-0000-000000000002', 'rep-r2@test.cg'),
    ('d0000000-0000-0000-0000-000000000003', 'rep-o1@test.cg'),
    ('d0000000-0000-0000-0000-000000000004', 'rep-admin@test.cg'),
    ('d0000000-0000-0000-0000-000000000005', 'rep-o2@test.cg'),
    ('d0000000-0000-0000-0000-000000000006', 'rep-r3@test.cg')
  ) as u(id, email);

insert into public.admins (user_id) values ('d0000000-0000-0000-0000-000000000004');

-- Insérées en superutilisateur : le trigger de publication ne s'applique pas.
insert into public.listings (
  id, slug, title, description, category, option_type, mobility, city,
  price_xaf, price_unit, cover_url, status, owner_id, is_verified
)
select l.id::uuid, l.slug, 'Profil ' || l.slug,
       'Description suffisamment longue pour la validation applicative.',
       'categorie-a', 'option_1', 'sur_place', 'brazzaville', 30000, 'hour',
       'https://exemple/' || l.slug || '.jpg', 'published', l.owner::uuid, true
  from (values
    ('d1000000-0000-0000-0000-000000000001', 'rep-l1', 'd0000000-0000-0000-0000-000000000003'),
    ('d1000000-0000-0000-0000-000000000002', 'rep-l2', 'd0000000-0000-0000-0000-000000000003'),
    ('d1000000-0000-0000-0000-000000000003', 'rep-l3', 'd0000000-0000-0000-0000-000000000005'),
    ('d1000000-0000-0000-0000-000000000004', 'rep-l4', 'd0000000-0000-0000-0000-000000000005'),
    ('d1000000-0000-0000-0000-000000000005', 'rep-l5', 'd0000000-0000-0000-0000-000000000005'),
    ('d1000000-0000-0000-0000-000000000006', 'rep-l6', 'd0000000-0000-0000-0000-000000000005'),
    ('d1000000-0000-0000-0000-000000000007', 'rep-l7', 'd0000000-0000-0000-0000-000000000005'),
    ('d1000000-0000-0000-0000-000000000008', 'rep-l8', 'd0000000-0000-0000-0000-000000000005')
  ) as l(id, slug, owner);

insert into public.verification_requests (user_id, status, challenge_code, document_type, reviewed_at)
values ('d0000000-0000-0000-0000-000000000005', 'approved', 'FIXTUR', 'cni', now());

/* -------------------------------------------------------------------------- */
/*                                  Accès                                     */
/* -------------------------------------------------------------------------- */

select ok(
  not has_function_privilege('anon', 'public.submit_report(uuid,report_reason,text)', 'EXECUTE'),
  'un visiteur non connecté ne peut pas signaler'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ insert into public.listing_reports (listing_id, reporter_id, reason, is_urgent)
     values ('d1000000-0000-0000-0000-000000000001',
             'd0000000-0000-0000-0000-000000000001', 'faux_profil', false) $$,
  '42501',
  null,
  'un signalement ne peut pas être inséré directement'
);

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000001', 'faux_profil', null) $$,
  'own_listing',
  'un partenaire ne peut pas signaler sa propre annonce'
);

/* -------------------------------------------------------------------------- */
/*                              Signalement                                   */
/* -------------------------------------------------------------------------- */

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000001', 'faux_profil',
       'Photos reprises d''un autre site.') $$,
  'un compte peut signaler une annonce visible'
);

select throws_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000001', 'arnaque', null) $$,
  'already_reported',
  'un second signalement ouvert sur la même annonce est refusé'
);

select throws_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000002', 'autre', 'court') $$,
  'details_required',
  '« autre » exige des précisions'
);

select is(
  (select reason::text from public.listing_reports),
  'faux_profil',
  'le signaleur relit le motif de son signalement'
);

select throws_ok(
  $$ select status from public.listing_reports $$,
  '42501',
  null,
  'le signaleur ne peut pas lire la suite donnée à son signalement'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.listings where slug = 'rep-l1'),
  1,
  'un motif non urgent ne masque pas le profil'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.listing_reports),
  0,
  'un tiers ne voit aucun signalement'
);

select lives_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000002', 'personne_mineure', null) $$,
  'un compte peut signaler une personne mineure présumée'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.listings where slug = 'rep-l2'),
  0,
  'un motif urgent masque immédiatement le profil'
);

select throws_ok(
  $$ select submit_request('d1000000-0000-0000-0000-000000000002'::uuid,
       'Client Test', '+242 06 505 50 50', null, '', null::date, null::smallint) $$,
  'listing_unavailable',
  'un profil suspendu ne reçoit plus de demande'
);

reset role;

insert into public.requests (id, listing_id, full_name, phone, status, author_id)
values ('d3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002',
        'Client Paiement', '+242 06 606 60 60', 'pending', 'd0000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select * from create_payment('d3000000-0000-0000-0000-000000000001'::uuid,
       'MTN_MOMO_COG'::payment_provider, '242061234567') $$,
  'listing_unavailable',
  'une réservation sur un profil suspendu ne peut pas être payée'
);

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$ update public.listings set suspended_at = null
      where id = 'd1000000-0000-0000-0000-000000000002' $$,
  '42501',
  null,
  'le partenaire ne peut pas lever la suspension'
);

select lives_ok(
  $$ update public.listings set status = 'draft'
      where id = 'd1000000-0000-0000-0000-000000000002' $$,
  'le partenaire peut repasser son profil suspendu en brouillon'
);

select lives_ok(
  $$ update public.listings set status = 'published'
      where id = 'd1000000-0000-0000-0000-000000000002' $$,
  'le partenaire vérifié peut le republier'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.listings where slug = 'rep-l2'),
  0,
  'republier ne lève pas la suspension'
);

reset role;

/* -------------------------------------------------------------------------- */
/*                             Limite horaire                                 */
/* -------------------------------------------------------------------------- */

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select * from submit_report('d1000000-0000-0000-0000-000000000004', 'arnaque', null);
select * from submit_report('d1000000-0000-0000-0000-000000000005', 'arnaque', null);
select * from submit_report('d1000000-0000-0000-0000-000000000006', 'arnaque', null);
select * from submit_report('d1000000-0000-0000-0000-000000000007', 'arnaque', null);

select throws_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000008', 'arnaque', null) $$,
  'rate_limited',
  'le sixième signalement en une heure est refusé'
);

/* -------------------------------------------------------------------------- */
/*                              Administration                                */
/* -------------------------------------------------------------------------- */

select throws_ok(
  $$ select review_report((select id from public.listing_reports limit 1), 'dismiss') $$,
  '42501',
  'forbidden',
  'un non-administrateur ne peut pas trancher un signalement'
);

select throws_ok(
  $$ select * from admin_list_open_reports() $$,
  '42501',
  'forbidden',
  'un non-administrateur ne peut pas lister les signalements'
);

reset role;

-- Un profil suspendu n'est plus signalable par l'application : le second
-- signalement urgent est posé en superutilisateur.
insert into public.listing_reports (id, listing_id, owner_id, reporter_id, reason, is_urgent)
values ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000006',
        'contrainte_exploitation', true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select count(*)::int from admin_list_open_reports()),
  7,
  'l''administrateur voit tous les signalements ouverts'
);

select is(
  (select is_urgent from admin_list_open_reports() limit 1),
  true,
  'les signalements urgents sont listés en tête'
);

select lives_ok(
  $$ select review_report(
       (select id from admin_list_open_reports() where reason = 'personne_mineure'), 'dismiss') $$,
  'un administrateur peut juger un signalement infondé'
);

reset role;

select ok(
  (select suspended_at is not null from public.listings
    where id = 'd1000000-0000-0000-0000-000000000002'),
  'la suspension reste tant qu''un autre signalement urgent est ouvert'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select lives_ok(
  $$ select review_report('d2000000-0000-0000-0000-000000000001', 'dismiss', 'Vérification faite') $$,
  'le second signalement urgent est aussi jugé infondé'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.listings where slug = 'rep-l2'),
  1,
  'la suspension est levée quand plus aucun signalement urgent n''est ouvert'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select throws_ok(
  $$ select review_report(
       (select id from admin_list_open_reports()
         where listing_id = 'd1000000-0000-0000-0000-000000000001'), 'remove') $$,
  'note_required',
  'retirer un profil exige une note'
);

select lives_ok(
  $$ select review_report(
       (select id from admin_list_open_reports()
         where listing_id = 'd1000000-0000-0000-0000-000000000001'),
       'remove', 'Photos volées confirmées') $$,
  'un administrateur peut retirer un profil'
);

select throws_ok(
  $$ select review_report('d2000000-0000-0000-0000-000000000001', 'dismiss') $$,
  'already_reviewed',
  'un signalement déjà traité ne peut pas l''être une seconde fois'
);

reset role;

select is(
  (select status::text from public.listings where id = 'd1000000-0000-0000-0000-000000000001'),
  'archived',
  'retirer le profil l''archive'
);

select ok(
  (select suspended_at is not null from public.listings
    where id = 'd1000000-0000-0000-0000-000000000001'),
  'et le suspend définitivement'
);

/* -------------------------------------------------------------------------- */
/*                            Constat de minorité                             */
/* -------------------------------------------------------------------------- */

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000006","role":"authenticated"}';

select lives_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000003', 'personne_mineure',
       'Semble avoir moins de 18 ans.') $$,
  'un troisième compte signale le profil d''un autre partenaire'
);

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select lives_ok(
  $$ select review_report(
       (select id from admin_list_open_reports()
         where listing_id = 'd1000000-0000-0000-0000-000000000003'), 'block_minor') $$,
  'un administrateur peut constater la minorité depuis un signalement'
);

reset role;

select is(
  (select count(*)::int from public.listings
    where owner_id = 'd0000000-0000-0000-0000-000000000005' and status <> 'archived'),
  0,
  'constat de minorité : tous les profils du compte sont archivés'
);

select is(
  (select count(*)::int from public.verification_blocks
    where user_id = 'd0000000-0000-0000-0000-000000000005'),
  1,
  'le compte est bloqué'
);

select is(
  (select status::text from public.verification_requests
    where user_id = 'd0000000-0000-0000-0000-000000000005'),
  'revoked',
  'sa vérification approuvée est révoquée'
);

select is(
  (select count(*)::int from public.listing_reports
    where owner_id = 'd0000000-0000-0000-0000-000000000005' and status = 'open'),
  0,
  'les autres signalements ouverts sur ses profils sont clos'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000005","role":"authenticated"}';

select throws_ok(
  $$ select * from start_verification() $$,
  'blocked',
  'le compte bloqué ne peut plus demander de vérification'
);

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select count(*)::int from public.moderation_log where report_id is not null),
  4,
  'chaque décision sur un signalement est journalisée'
);

reset role;

select * from finish();
rollback;
```

Compter les assertions : 40. Si un test est ajouté ou retiré, ajuster `plan(40)`.

- [ ] **Step 2 : Vérifier l'échec**

Run : `supabase test db`
Expected : FAIL sur `reports.test.sql` (`type "report_reason" does not exist` ou `function submit_report … does not exist`) ; `security.test.sql` et `verification.test.sql` restent verts.

- [ ] **Step 3 : Vérifier le nom de la contrainte d'action**

```bash
/opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "select conname from pg_constraint where conrelid = 'public.moderation_log'::regclass and contype = 'c';"
```

Expected : `moderation_log_action_check` et `moderation_log_single_target`. Si le nom de la contrainte sur `action` diffère, utiliser le nom réel dans la migration.

- [ ] **Step 4 : Écrire la migration**

`supabase/migrations/0012_listing_reports.sql` :

```sql
-- Signalement d'annonces.
--
-- Un compte connecté peut signaler une annonce visible. Les motifs graves
-- (personne mineure présumée, contrainte ou exploitation) masquent le profil
-- immédiatement, par précaution ; l'équipe tranche ensuite : signalement
-- infondé, retrait du profil, ou constat de minorité avec blocage du compte.
--
-- Principes, dans la continuité de la migration 0011 :
--   1. Aucune écriture directe : tout passe par des fonctions SECURITY DEFINER.
--   2. La suspension est une colonne dédiée, intégrée à la policy de lecture
--      publique : le statut choisi par le partenaire reste intact, et il ne
--      peut pas lever la suspension en republiant.
--   3. Le signaleur n'a aucun suivi : les GRANT de colonne l'empêchent de lire
--      `status` et la note de décision.

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

create type public.report_reason as enum (
  'personne_mineure',
  'contrainte_exploitation',
  'faux_profil',
  'arnaque',
  'autre'
);

create type public.report_status as enum ('open', 'confirmed', 'dismissed');

/* -------------------------------------------------------------------------- */
/*                                   Table                                    */
/* -------------------------------------------------------------------------- */

create table public.listing_reports (
  id              uuid primary key default gen_random_uuid(),
  -- `set null` partout : un signalement grave doit survivre à la suppression
  -- de l'annonce, du compte propriétaire ou du compte signaleur.
  listing_id      uuid references public.listings (id) on delete set null,
  owner_id        uuid references auth.users (id) on delete set null,
  reporter_id     uuid references auth.users (id) on delete set null,
  reason          public.report_reason not null,
  -- Colonne ordinaire contrôlée plutôt que générée : une colonne générée
  -- exige une expression immuable, et la comparaison à un littéral d'enum
  -- passe par une conversion qui ne l'est pas toujours.
  is_urgent       boolean not null,
  details         text check (details is null or char_length(details) <= 1000),
  status          public.report_status not null default 'open',
  reviewed_by     uuid references auth.users (id) on delete set null,
  reviewed_at     timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 300),
  created_at      timestamptz not null default now(),

  constraint listing_reports_urgency
    check (is_urgent = (reason in ('personne_mineure', 'contrainte_exploitation'))),
  constraint listing_reports_other_has_details
    check (reason <> 'autre' or char_length(trim(coalesce(details, ''))) >= 10)
);

create unique index listing_reports_one_open
  on public.listing_reports (reporter_id, listing_id)
  where status = 'open';

create index listing_reports_queue_idx
  on public.listing_reports (is_urgent desc, created_at)
  where status = 'open';

create index listing_reports_rate_idx
  on public.listing_reports (reporter_id, created_at);

alter table public.listing_reports enable row level security;

-- Seule policy de lecture : le signaleur relit ses propres signalements (export
-- de ses données). L'administration passe par `admin_list_open_reports`.
create policy "listing_reports_self_read"
  on public.listing_reports for select
  using (reporter_id = auth.uid());

revoke all on public.listing_reports from anon, authenticated;
-- GRANT de colonne : ni `status`, ni la note, ni le propriétaire.
grant select (id, listing_id, reason, details, created_at) on public.listing_reports to authenticated;
grant select, insert, update, delete on public.listing_reports to service_role;

/* -------------------------------------------------------------------------- */
/*                                Suspension                                  */
/* -------------------------------------------------------------------------- */

-- Hors des GRANT client (migrations 0001 et 0006) : seul le propriétaire de
-- la table, via les fonctions ci-dessous, peut la renseigner ou l'effacer.
alter table public.listings add column suspended_at timestamptz;

drop policy "listings_public_read" on public.listings;

create policy "listings_public_read"
  on public.listings for select
  using (
    status = 'published'
    and (is_verified or verification_grace_until > now())
    and suspended_at is null
  );

-- Même règle que la lecture publique : ces fonctions contournent RLS.
-- Redéfinitions intégrales de la migration 0011 ; seule la condition
-- `suspended_at is null` s'ajoute.
create or replace function public.submit_request(
  p_listing_id  uuid,
  p_full_name   text,
  p_phone       text,
  p_email       text,
  p_message     text,
  p_desired_date date,
  p_guests      smallint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- L'annonce doit exister, être publiée, visible publiquement et non suspendue.
  if not exists (
    select 1 from public.listings
    where id = p_listing_id
      and status = 'published'
      and (is_verified or verification_grace_until > now())
      and suspended_at is null
  ) then
    raise exception 'listing_unavailable' using errcode = '22023';
  end if;

  -- Anti-spam : 5 demandes maximum par heure pour un même numéro.
  if (
    select count(*) from public.requests
    where phone = p_phone and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  insert into public.requests (
    listing_id, full_name, phone, email, message, desired_date, guests, author_id
  ) values (
    p_listing_id, trim(p_full_name), p_phone, nullif(trim(p_email), ''),
    coalesce(p_message, ''), p_desired_date, p_guests, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.create_payment(
  p_request_id uuid,
  p_provider   payment_provider,
  p_phone      text
) returns table (payment_id uuid, amount_xaf integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing      uuid;
  v_amount       integer;
  v_id           uuid;
  v_status       listing_status;
  v_is_verified  boolean;
  v_grace_until  timestamptz;
  v_suspended_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- La demande doit appartenir à l'appelant. Le montant est lu sur l'annonce,
  -- pas reçu en paramètre : un client ne peut pas se facturer 1 FCFA.
  select r.listing_id, l.price_xaf, l.status, l.is_verified, l.verification_grace_until, l.suspended_at
    into v_listing, v_amount, v_status, v_is_verified, v_grace_until, v_suspended_at
    from public.requests r
    join public.listings l on l.id = r.listing_id
   where r.id = p_request_id
     and r.author_id = auth.uid()
     and r.status <> 'cancelled';

  if v_listing is null then
    raise exception 'not_eligible' using errcode = '42501';
  end if;

  if v_status <> 'published'
     or not (v_is_verified or v_grace_until > now())
     or v_suspended_at is not null then
    raise exception 'listing_unavailable' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.payments
     where request_id = p_request_id
       and status in ('pending', 'processing', 'completed')
  ) then
    raise exception 'payment_already_exists' using errcode = '22023';
  end if;

  insert into public.payments (request_id, listing_id, payer_id, amount_xaf, provider, phone)
  values (p_request_id, v_listing, auth.uid(), v_amount, p_provider, regexp_replace(p_phone, '\D', '', 'g'))
  returning id into v_id;

  return query select v_id, v_amount;
end;
$$;

/* -------------------------------------------------------------------------- */
/*                          Journal de modération                             */
/* -------------------------------------------------------------------------- */

alter table public.moderation_log add column report_id uuid;

alter table public.moderation_log drop constraint moderation_log_single_target;
alter table public.moderation_log add constraint moderation_log_single_target
  check (num_nonnulls(review_id, verification_id, report_id) = 1);

alter table public.moderation_log drop constraint moderation_log_action_check;
alter table public.moderation_log add constraint moderation_log_action_check
  check (action in (
    'remove_review', 'approve', 'reject', 'block_minor', 'revoke',
    'report_dismiss', 'report_remove', 'report_block_minor'
  ));

/* -------------------------------------------------------------------------- */
/*                                 Fonctions                                  */
/* -------------------------------------------------------------------------- */

create or replace function public.submit_report(
  p_listing_id uuid,
  p_reason     public.report_reason,
  p_details    text
) returns table (id uuid, is_urgent boolean, listing_title text, listing_city text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_title   text;
  v_city    text;
  v_details text := nullif(trim(coalesce(p_details, '')), '');
  v_urgent  boolean;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_reason is null then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  v_urgent := p_reason in ('personne_mineure', 'contrainte_exploitation');

  -- Même prédicat que `listings_public_read` : on ne signale que ce que le
  -- public voit.
  select l.owner_id, l.title, l.city
    into v_owner, v_title, v_city
    from public.listings l
   where l.id = p_listing_id
     and l.status = 'published'
     and (l.is_verified or l.verification_grace_until > now())
     and l.suspended_at is null;

  if not found then
    raise exception 'listing_unavailable' using errcode = '22023';
  end if;

  if v_owner = v_uid then
    raise exception 'own_listing' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.listing_reports r
     where r.reporter_id = v_uid and r.listing_id = p_listing_id and r.status = 'open'
  ) then
    raise exception 'already_reported' using errcode = '22023';
  end if;

  if (
    select count(*) from public.listing_reports r
     where r.reporter_id = v_uid and r.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'details_too_long' using errcode = '22023';
  end if;

  if p_reason = 'autre' and char_length(coalesce(v_details, '')) < 10 then
    raise exception 'details_required' using errcode = '22023';
  end if;

  insert into public.listing_reports as r (listing_id, owner_id, reporter_id, reason, is_urgent, details)
  values (p_listing_id, v_owner, v_uid, p_reason, v_urgent, v_details)
  returning r.id into v_id;

  if v_urgent then
    update public.listings l
       set suspended_at = now()
     where l.id = p_listing_id and l.suspended_at is null;
  end if;

  return query select v_id, v_urgent, v_title, v_city;
end;
$$;

create or replace function public.review_report(
  p_report_id uuid,
  p_decision  text,
  p_note      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.listing_reports%rowtype;
  v_note   text := left(nullif(trim(coalesce(p_note, '')), ''), 300);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('dismiss', 'remove', 'block_minor') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  select * into v_report
    from public.listing_reports r
   where r.id = p_report_id
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_report.status <> 'open' then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;

  if p_decision = 'remove' and v_note is null then
    raise exception 'note_required' using errcode = '22023';
  end if;

  -- Même clé que la vérification d'identité (migration 0011) : une annonce
  -- créée pendant un blocage attend la décision, puis la voit.
  if v_report.owner_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_report.owner_id::text, 0));
  end if;

  update public.listing_reports
     set status = case when p_decision = 'dismiss' then 'dismissed' else 'confirmed' end::public.report_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         resolution_note = v_note
   where id = p_report_id;

  if p_decision = 'dismiss' then
    -- La suspension ne tombe que si plus aucun signalement urgent ne vise
    -- l'annonce.
    if v_report.listing_id is not null and not exists (
      select 1 from public.listing_reports r
       where r.listing_id = v_report.listing_id
         and r.status = 'open'
         and r.is_urgent
    ) then
      update public.listings set suspended_at = null where id = v_report.listing_id;
    end if;

  elsif p_decision = 'remove' then
    if v_report.listing_id is not null then
      update public.listings
         set status = 'archived', suspended_at = coalesce(suspended_at, now())
       where id = v_report.listing_id;

      update public.listing_reports
         set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = v_note
       where listing_id = v_report.listing_id and status = 'open';
    end if;

  else -- block_minor
    if v_report.owner_id is not null then
      update public.listings
         set status = 'archived',
             is_verified = false,
             verification_grace_until = null,
             suspended_at = coalesce(suspended_at, now())
       where owner_id = v_report.owner_id;

      insert into public.verification_blocks (user_id, verification_id, blocked_by)
      values (v_report.owner_id, null, auth.uid())
      on conflict (user_id) do nothing;

      update public.verification_requests
         set status = 'revoked', rejection_reason = 'personne_mineure',
             reviewed_by = auth.uid(), reviewed_at = now()
       where user_id = v_report.owner_id and status = 'approved';

      update public.verification_requests
         set status = 'rejected', rejection_reason = 'personne_mineure',
             reviewed_by = auth.uid(), reviewed_at = now()
       where user_id = v_report.owner_id and status = 'pending';

      delete from public.verification_requests
       where user_id = v_report.owner_id and status = 'awaiting_video';

      update public.listing_reports
         set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = v_note
       where owner_id = v_report.owner_id and status = 'open';
    end if;
  end if;

  insert into public.moderation_log (report_id, listing_id, moderator_id, action, reason)
  values (p_report_id, v_report.listing_id, auth.uid(), 'report_' || p_decision, v_note);
end;
$$;

create or replace function public.admin_list_open_reports()
returns table (
  id                      uuid,
  reason                  public.report_reason,
  is_urgent               boolean,
  details                 text,
  created_at              timestamptz,
  reporter_id             uuid,
  owner_id                uuid,
  listing_id              uuid,
  listing_title           text,
  listing_city            text,
  listing_cover_url       text,
  listing_description     text,
  listing_status          public.listing_status,
  listing_suspended_at    timestamptz,
  listing_is_verified     boolean,
  listing_grace_until     timestamptz,
  open_reports_on_listing integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select r.id, r.reason, r.is_urgent, r.details, r.created_at,
           r.reporter_id, r.owner_id, r.listing_id,
           l.title, l.city, l.cover_url, left(l.description, 280),
           l.status, l.suspended_at, l.is_verified, l.verification_grace_until,
           (select count(*)::int from public.listing_reports o
             where o.listing_id = r.listing_id and o.status = 'open')
      from public.listing_reports r
      left join public.listings l on l.id = r.listing_id
     where r.status = 'open'
     order by r.is_urgent desc, r.created_at asc
     limit 200;
end;
$$;

revoke execute on function public.submit_report(uuid, public.report_reason, text) from public, anon;
revoke execute on function public.review_report(uuid, text, text) from public, anon;
revoke execute on function public.admin_list_open_reports() from public, anon;

grant execute on function public.submit_report(uuid, public.report_reason, text) to authenticated;
grant execute on function public.review_report(uuid, text, text) to authenticated;
grant execute on function public.admin_list_open_reports() to authenticated;
```

- [ ] **Step 5 : Appliquer et vérifier**

```bash
supabase db reset
supabase test db
```

Expected : PASS — `security.test.sql` 34, `verification.test.sql` 56, `reports.test.sql` 40 (130 au total).

Points de diagnostic si une assertion échoue :
- **Assertion « le signaleur relit le motif »** : la policy lit `reporter_id`, colonne non accordée ; PostgreSQL n'exige pas de droit de colonne pour les expressions de policy. Si l'erreur 42501 apparaît quand même, remplacer la policy par `using (id in (select public.own_report_ids()))` avec une fonction `SECURITY DEFINER stable` `own_report_ids()` renvoyant `setof uuid` des signalements de `auth.uid()` (révoquée de public/anon, accordée à authenticated), et le consigner dans le rapport.
- **`rate_limited` non levé** : vérifier que le signalement refusé « autre » n'a rien inséré.
- Après chaque bascule vers `anon`, `request.jwt.claims` doit être réinitialisé (fuite du rôle administrateur constatée pendant la migration 0011).

- [ ] **Step 6 : Commit**

```bash
git add supabase/migrations/0012_listing_reports.sql supabase/tests/reports.test.sql
git commit -m "feat(signalement): table des signalements, suspension et décisions en base

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3 : Schéma TypeScript

**Files :**
- Modify : `src/types/database.ts`

**Interfaces :**
- Consumes : `ReportReason`, `ReportStatus`, `ReportDecision` (Task 1) ; fonctions SQL (Task 2).
- Produces : `ListingReportRow`, `OpenReportRow`, tables `listing_reports` et `verification_blocks` (existante depuis 0011, jamais typée), `ListingRow.suspended_at`, RPC `submit_report`, `review_report`, `admin_list_open_reports`, enums `report_reason`, `report_status`, action étendue du journal.

- [ ] **Step 1 : Imports et types de ligne**

Ajouter après le bloc d'import de `./verification` :

```ts
import type { ReportDecision, ReportReason, ReportStatus } from "./reports";
```

Après `VerificationRequestRow`, ajouter :

```ts
export type ListingReportRow = {
  id: string;
  listing_id: string | null;
  owner_id: string | null;
  reporter_id: string | null;
  reason: ReportReason;
  is_urgent: boolean;
  details: string | null;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
};

/** Ligne renvoyée par `admin_list_open_reports`. */
export type OpenReportRow = {
  id: string;
  reason: ReportReason;
  is_urgent: boolean;
  details: string | null;
  created_at: string;
  reporter_id: string | null;
  owner_id: string | null;
  listing_id: string | null;
  listing_title: string | null;
  listing_city: string | null;
  listing_cover_url: string | null;
  listing_description: string | null;
  listing_status: ListingStatus | null;
  listing_suspended_at: string | null;
  listing_is_verified: boolean | null;
  listing_grace_until: string | null;
  open_reports_on_listing: number;
};
```

Dans `ListingRow`, après `verification_grace_until: string | null;` :

```ts
  /** Renseignée par un signalement urgent ou une décision de retrait ; masque le profil. */
  suspended_at: string | null;
```

- [ ] **Step 2 : Tables**

Dans `moderation_log.Row`, ajouter `report_id: string | null;` après `verification_id` et remplacer la ligne `action` par :

```ts
          action: "remove_review" | VerificationDecision | `report_${ReportDecision}`;
```

Mettre le commentaire à jour : `// Écrit exclusivement par moderate_review, review_verification et review_report.`

Après la table `verification_requests`, ajouter :

```ts
      listing_reports: {
        Row: ListingReportRow;
        // Écritures réservées à `submit_report` et `review_report` ; le
        // signaleur ne lit que id, listing_id, reason, details, created_at.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      verification_blocks: {
        // Lue avec service_role par l'administration (état du propriétaire).
        Row: {
          user_id: string;
          verification_id: string | null;
          blocked_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
```

- [ ] **Step 3 : Fonctions et enums**

Dans `Functions`, ajouter :

```ts
      submit_report: {
        Args: { p_listing_id: string; p_reason: ReportReason; p_details: string | null };
        Returns: { id: string; is_urgent: boolean; listing_title: string; listing_city: string }[];
      };
      review_report: {
        Args: { p_report_id: string; p_decision: ReportDecision; p_note?: string | null };
        Returns: undefined;
      };
      admin_list_open_reports: { Args: Record<string, never>; Returns: OpenReportRow[] };
```

Dans `Enums`, ajouter :

```ts
      report_reason: ReportReason;
      report_status: ReportStatus;
```

- [ ] **Step 4 : Vérifier**

Run : `npx tsc --noEmit` puis `npm run check`
Expected : aucune sortie de tsc ; tests verts.

- [ ] **Step 5 : Commit**

```bash
git add src/types/database.ts
git commit -m "feat(signalement): typer la table et les fonctions de signalement

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4 : Alerte e-mail et Server Actions

**Files :**
- Modify : `src/lib/notifications.ts`
- Create : `src/app/actions/reports.ts`

**Interfaces :**
- Consumes : RPC `submit_report`, `review_report` (Task 3) ; `checkReportDetails`, `parseAlertRecipients`, `reportErrorMessage`, `MAX_RESOLUTION_NOTE`, `ReportFormState`, `ReviewReportState` (Task 1) ; `isReportReason`, `isReportDecision`, `reportReason` ; `LISTINGS_TAG` (`@/lib/listings`) ; `cityLabel` (`@/types/listing`).
- Produces :
  - `sendReportAlert(to: string[], alert: ReportAlert): Promise<boolean>` et le type `ReportAlert = { listingTitle: string; city: string; reasonLabel: string; reportedAt: string; adminUrl: string }` ;
  - `submitReport(prev: ReportFormState, formData: FormData): Promise<ReportFormState>` — champs `listing_id`, `slug`, `reason`, `details` ;
  - `reviewReport(prev: ReviewReportState, formData: FormData): Promise<ReviewReportState>` — champs `report_id`, `decision` (bouton soumetteur), `note`.

- [ ] **Step 1 : Factoriser l'envoi et ajouter l'alerte**

Dans `src/lib/notifications.ts`, remplacer toute la fonction `sendRequestNotification` (de son bloc de commentaire jusqu'à son accolade fermante) par :

```ts
/**
 * Envoi via l'API HTTP de Resend, sans dépendance supplémentaire. Si la clé
 * n'est pas configurée, on journalise et on retourne `false` sans lever : une
 * notification manquée ne doit jamais faire échouer l'enregistrement qui l'a
 * déclenchée, déjà en base à ce stade.
 */
async function sendEmail(message: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn("[notifications] RESEND_API_KEY/NOTIFY_EMAIL_FROM absents — envoi ignoré");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        reply_to: message.replyTo,
      }),
    });

    if (!response.ok) {
      console.error("[notifications] resend error", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[notifications] send failed", error);
    return false;
  }
}

/** Alerte « nouvelle demande » au partenaire. */
export async function sendRequestNotification(
  to: string,
  notification: RequestNotification,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Nouvelle demande — ${notification.listingTitle}`,
    html: renderEmail(notification),
    replyTo: notification.email ?? undefined,
  });
}

export type ReportAlert = {
  listingTitle: string;
  city: string;
  reasonLabel: string;
  reportedAt: string;
  adminUrl: string;
};

/**
 * Alerte à l'équipe pour un signalement urgent. Volontairement minimale : ni
 * l'identité du signaleur ni ses précisions ne quittent l'administration.
 */
export async function sendReportAlert(to: string[], alert: ReportAlert): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Signalement urgent — ${alert.reasonLabel}`,
    html: renderReportAlert(alert),
  });
}
```

Puis ajouter à la fin du fichier :

```ts
function renderReportAlert(alert: ReportAlert): string {
  const reportedAt = new Date(alert.reportedAt).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Brazzaville",
  });

  return `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a1a1aa;margin:0 0 4px;">Matripa · modération</p>
  <h1 style="font-size:20px;color:#b91c1c;margin:0 0 16px;">Signalement urgent</h1>
  <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;">
    Le profil a été masqué par précaution. Il attend une décision de l'équipe.
  </p>
  <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">
    <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;">Motif</td><td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:600;">${escapeHtml(alert.reasonLabel)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;">Profil</td><td style="padding:6px 0;color:#18181b;font-size:14px;">${escapeHtml(alert.listingTitle)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;">Ville</td><td style="padding:6px 0;color:#18181b;font-size:14px;">${escapeHtml(alert.city)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;">Reçu le</td><td style="padding:6px 0;color:#18181b;font-size:14px;">${escapeHtml(reportedAt)}</td></tr>
  </table>
  <a href="${escapeHtml(alert.adminUrl)}"
     style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:14px;font-weight:600;">
    Ouvrir l'administration
  </a>
</div>`.trim();
}
```

- [ ] **Step 2 : Écrire les Server Actions**

`src/app/actions/reports.ts` :

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";

import { LISTINGS_TAG } from "@/lib/listings";
import { sendReportAlert } from "@/lib/notifications";
import {
  checkReportDetails,
  MAX_RESOLUTION_NOTE,
  parseAlertRecipients,
  reportErrorMessage,
  type ReportFormState,
  type ReviewReportState,
} from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { cityLabel } from "@/types/listing";
import { isReportDecision, isReportReason, reportReason } from "@/types/reports";

/**
 * Signalement d'une annonce par un compte connecté.
 *
 * Toutes les règles (visibilité, propre annonce, doublon, limite horaire,
 * suspension immédiate des motifs urgents) sont appliquées par
 * `submit_report` ; les contrôles ci-dessous ne servent qu'à répondre vite.
 */
export async function submitReport(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const listingId = formData.get("listing_id");
  const slug = formData.get("slug");
  const reason = formData.get("reason");
  const rawDetails = formData.get("details");
  const details = typeof rawDetails === "string" ? rawDetails.trim() : "";

  if (typeof listingId !== "string" || !listingId || typeof slug !== "string" || !slug) {
    return { status: "error", urgent: false, message: "Formulaire invalide. Rechargez la page." };
  }
  if (!isReportReason(reason)) {
    return { status: "error", urgent: false, message: reportErrorMessage("invalid_reason") };
  }

  const detailsError = checkReportDetails(reason, details);
  if (detailsError) return { status: "error", urgent: false, message: detailsError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/connexion?suivant=/signaler/${slug}`);

  const { data, error } = await supabase.rpc("submit_report", {
    p_listing_id: listingId,
    p_reason: reason,
    p_details: details || null,
  });

  if (error) {
    console.error("[reports] submit failed", error);
    return { status: "error", urgent: false, message: reportErrorMessage(error.message) };
  }

  const row = data?.[0];
  const urgent = row?.is_urgent === true;

  if (urgent && row) {
    // Le profil vient d'être suspendu : le catalogue mis en cache ne doit pas
    // continuer à l'afficher pendant cinq minutes.
    revalidateTag(LISTINGS_TAG);
    revalidatePath(`/annonces/${slug}`);

    const recipients = parseAlertRecipients(process.env.REPORT_ALERT_EMAILS);
    if (recipients.length === 0) {
      console.warn("[reports] REPORT_ALERT_EMAILS absent — alerte non envoyée");
    } else {
      await sendReportAlert(recipients, {
        listingTitle: row.listing_title,
        city: cityLabel(row.listing_city),
        reasonLabel: reportReason(reason)?.label ?? reason,
        reportedAt: new Date().toISOString(),
        adminUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin`,
      });
    }
  }

  return { status: "success", urgent, message: null };
}

/**
 * Décision de l'équipe sur un signalement. `review_report` vérifie
 * l'appartenance à `admins` : cette action est un point d'entrée public et
 * ne fait confiance à aucun champ du formulaire.
 */
export async function reviewReport(
  _prev: ReviewReportState,
  formData: FormData,
): Promise<ReviewReportState> {
  const reportId = formData.get("report_id");
  const decision = formData.get("decision");
  const note = formData.get("note");

  if (typeof reportId !== "string" || !reportId || !isReportDecision(decision)) {
    return { status: "error", message: reportErrorMessage("invalid_decision") };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("review_report", {
    p_report_id: reportId,
    p_decision: decision,
    p_note: typeof note === "string" && note.trim() ? note.trim().slice(0, MAX_RESOLUTION_NOTE) : null,
  });

  if (error) {
    console.error("[reports] review failed", error);
    revalidatePath("/admin");
    return { status: "error", message: reportErrorMessage(error.message) };
  }

  revalidatePath("/admin");
  revalidatePath("/partenaire");
  revalidateTag(LISTINGS_TAG);
  return { status: "success", message: null };
}
```

- [ ] **Step 3 : Vérifier**

Run : `npx tsc --noEmit` puis `npm run check`
Expected : aucune sortie de tsc ; tests verts.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/notifications.ts src/app/actions/reports.ts
git commit -m "feat(signalement): alerte e-mail et actions de signalement et de décision

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5 : Parcours de signalement

**Files :**
- Create : `src/components/reports/ReportForm.tsx`
- Create : `src/app/signaler/[slug]/page.tsx`
- Modify : `src/app/annonces/[slug]/page.tsx` (lien)
- Modify : `src/middleware.ts` (`matcher`)

**Interfaces :**
- Consumes : `submitReport` (Task 4) ; `INITIAL_REPORT_STATE`, `MAX_REPORT_DETAILS` (Task 1) ; `REPORT_REASONS` ; `fetchListingBySlug` (`@/lib/listings`) ; `cityLabel`.
- Produces : route `/signaler/[slug]` ; textes utilisés par les tests de bout en bout : titre « Signaler un profil », boutons radio aux libellés de `REPORT_REASONS`, champ « Précisions », bouton « Envoyer le signalement », titre de confirmation « Signalement transmis », lien « Signaler ce profil » sur la fiche.

- [ ] **Step 1 : Écrire le formulaire**

`src/components/reports/ReportForm.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Flag, Loader2 } from "lucide-react";

import { submitReport } from "@/app/actions/reports";
import { INITIAL_REPORT_STATE, MAX_REPORT_DETAILS } from "@/lib/reports";
import { REPORT_REASONS } from "@/types/reports";

export function ReportForm({ listingId, listingSlug }: { listingId: string; listingSlug: string }) {
  const [state, formAction] = useActionState(submitReport, INITIAL_REPORT_STATE);

  if (state.status === "success") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-6 py-12 text-center"
      >
        <CheckCircle2 className="size-10 text-emerald-400" aria-hidden />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Signalement transmis</h2>
          <p className="text-sm text-slate-300">
            Merci. Votre signalement a été transmis à l&apos;équipe Matripa.
          </p>
          {state.urgent && (
            <p className="text-sm font-medium text-amber-200">
              Si une personne est en danger immédiat, contactez sans attendre la police ou les
              services d&apos;urgence.
            </p>
          )}
        </div>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-medium text-white transition hover:bg-white/[0.12]"
        >
          Retour aux profils
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="slug" value={listingSlug} />

      <fieldset className="space-y-2.5">
        <legend className="mb-2 text-sm font-medium text-slate-200">Motif du signalement</legend>
        {REPORT_REASONS.map((reason) => (
          <label
            key={reason.slug}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 transition hover:bg-white/[0.06]"
          >
            <input type="radio" name="reason" value={reason.slug} required className="mt-1 size-4 accent-rose-500" />
            <span className="text-sm text-slate-200">
              {reason.label}
              <span className="mt-0.5 block text-xs text-slate-500">{reason.help}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-amber-200/80">
          Pour une personne mineure présumée ou une contrainte, le profil est masqué immédiatement,
          par précaution, pendant l&apos;examen.
        </p>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="details" className="text-sm font-medium text-slate-200">
          Précisions
        </label>
        <textarea
          id="details"
          name="details"
          rows={4}
          maxLength={MAX_REPORT_DETAILS}
          placeholder="Ce qui vous alerte (obligatoire pour « Autre »)"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
        />
      </div>

      <p className="text-xs text-slate-500">
        Chaque signalement est enregistré avec votre compte. Les signalements abusifs sont tracés.
      </p>

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-500 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Flag className="size-4" aria-hidden />}
      Envoyer le signalement
    </button>
  );
}
```

- [ ] **Step 2 : Écrire la page**

`src/app/signaler/[slug]/page.tsx` :

```tsx
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin } from "lucide-react";

import { ReportForm } from "@/components/reports/ReportForm";
import { fetchListingBySlug } from "@/lib/listings";
import { createClient } from "@/lib/supabase/server";
import { cityLabel } from "@/types/listing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signaler un profil",
  robots: { index: false, follow: false },
};

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signalement réservé aux comptes connectés : retour au formulaire après connexion.
  if (!user) redirect(`/connexion?suivant=/signaler/${slug}`);

  // Lecture publique : un profil suspendu, masqué ou archivé n'est pas signalable.
  const listing = await fetchListingBySlug(slug);
  if (!listing) notFound();

  // Filtre `owner_id` explicite : `listings_public_read` rend l'annonce lisible
  // par tous, seule la correspondance du propriétaire compte ici.
  const { data: own } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listing.id)
    .eq("owner_id", user.id)
    .maybeSingle<{ id: string }>();

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <Link
          href={`/annonces/${listing.slug}`}
          className="mb-6 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour au profil
        </Link>

        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-white">Signaler un profil</h1>

        <div className="mb-8 flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl">
            <Image src={listing.cover_url} alt={listing.title} fill sizes="80px" className="object-cover" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="line-clamp-2 font-semibold text-white">{listing.title}</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {cityLabel(listing.city)}
            </p>
          </div>
        </div>

        {own ? (
          <p role="status" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300">
            Vous ne pouvez pas signaler votre propre profil.
          </p>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
            <ReportForm listingId={listing.id} listingSlug={listing.slug} />
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3 : Ajouter le lien sur la fiche**

Dans `src/app/annonces/[slug]/page.tsx` :

1. Ajouter `Flag,` à la liste d'icônes importée depuis `lucide-react` (ordre alphabétique : après `Check,`).
2. Juste après le bloc `<Section title={`Avis…`}>…</Section>` (dernière section de la colonne principale), ajouter :

```tsx
            <p>
              <Link
                href={`/signaler/${listing.slug}`}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 underline-offset-4 transition hover:text-slate-300 hover:underline"
              >
                <Flag className="size-3.5" aria-hidden />
                Signaler ce profil
              </Link>
            </p>
```

- [ ] **Step 4 : Couvrir la route par le middleware**

Dans `src/middleware.ts`, ajouter `"/signaler/:path*",` au tableau `matcher`, après `"/compte/:path*",`.

- [ ] **Step 5 : Vérifier**

Run : `npx tsc --noEmit`, `npm run check`, puis `npm run build 2>&1 | tail -20`
Expected : aucune erreur ; la route `/signaler/[slug]` apparaît dans la sortie du build comme dynamique (`ƒ`).

- [ ] **Step 6 : Commit**

```bash
git add src/components/reports/ReportForm.tsx "src/app/signaler/[slug]/page.tsx" "src/app/annonces/[slug]/page.tsx" src/middleware.ts
git commit -m "feat(signalement): page et formulaire de signalement

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6 : Côté partenaire et cycle de vie des données

**Files :**
- Create : `src/components/reports/SuspensionBanner.tsx`
- Modify : `src/app/partenaire/page.tsx`
- Modify : `src/app/api/mon-compte/export/route.ts`
- Modify : `src/app/confidentialite/page.tsx`

**Interfaces :**
- Consumes : `suspensionMessage` (Task 1) ; colonne `listings.suspended_at` (Tasks 2-3).
- Produces : pastille « Suspendu » ; bandeau dont le texte est `suspensionMessage(count)` ; clé `signalements` dans l'export.

- [ ] **Step 1 : Écrire le bandeau**

`src/components/reports/SuspensionBanner.tsx` :

```tsx
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
```

- [ ] **Step 2 : Intégrer au tableau de bord**

Dans `src/app/partenaire/page.tsx` :

1. Ajouter l'import : `import { SuspensionBanner } from "@/components/reports/SuspensionBanner";`
2. Dans `OwnListing`, ajouter `suspended_at: string | null;` après `verification_grace_until`.
3. Dans la projection de la requête `listings`, ajouter `, suspended_at` après `verification_grace_until`.
4. Après `const hiddenCount = …`, ajouter :

```tsx
  const suspendedCount = mine.filter((listing) => listing.suspended_at !== null).length;
```

5. Juste avant `{!isVerified && (`, ajouter :

```tsx
      <SuspensionBanner count={suspendedCount} />
```

6. Remplacer le composant `StatusPill` par :

```tsx
/**
 * `suspended` : suspendu après un signalement, prioritaire sur tout le reste.
 * `hidden` : publiée mais invisible du public (compte non vérifié, délai de
 * grâce écoulé ou absent). « En ligne » serait alors trompeur.
 */
function StatusPill({
  status,
  hidden,
  suspended,
}: {
  status: OwnListing["status"];
  hidden: boolean;
  suspended: boolean;
}) {
  const map = {
    published: { label: "En ligne", className: "bg-emerald-500/15 text-emerald-300" },
    draft: { label: "Brouillon", className: "bg-amber-500/15 text-amber-300" },
    archived: { label: "Archivée", className: "bg-slate-500/15 text-slate-400" },
  } as const;
  const { label, className } = suspended
    ? { label: "Suspendu", className: "bg-red-500/15 text-red-300" }
    : hidden
      ? { label: "Masqué", className: "bg-amber-500/15 text-amber-300" }
      : map[status];

  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-medium", className)}>
      {label}
    </span>
  );
}
```

7. À l'appel de `<StatusPill …>`, ajouter la prop `suspended={listing.suspended_at !== null}` en conservant les props existantes.

- [ ] **Step 3 : Export des données**

Dans `src/app/api/mon-compte/export/route.ts`, remplacer `const [requests, reviews, listings, verifications] = await Promise.all([` par `const [requests, reviews, listings, verifications, reports] = await Promise.all([` et ajouter comme dernier élément du tableau :

```ts
    // Sans filtre `reporter_id` : la colonne n'est pas accordée au rôle client,
    // la filtrer lèverait une erreur de droits. La policy
    // `listing_reports_self_read` borne déjà le résultat aux signalements du
    // compte, et c'est la seule policy de lecture de la table.
    supabase.from("listing_reports").select("id, listing_id, reason, details, created_at"),
```

Dans `payload`, après `verifications_identite: verifications.data ?? [],` :

```ts
    signalements: reports.data ?? [],
```

- [ ] **Step 4 : Politique de confidentialité**

Dans `src/app/confidentialite/page.tsx` :

1. Dans « Données collectées », après l'élément « Vérification d'identité », ajouter :

```tsx
          <li>
            <strong className="text-white">Signalements</strong> — motif, précisions éventuelles
            et compte à l&apos;origine du signalement.
          </li>
```

2. Dans « Finalités et destinataires », après le paragraphe sur la vidéo de vérification, ajouter :

```tsx
        <p>
          Les signalements servent à la <strong className="text-white">sécurité de la plateforme
          et à la protection des personnes</strong>. Seule l&apos;équipe de modération Matripa les
          consulte ; le profil signalé n&apos;apprend ni le motif ni l&apos;identité de la
          personne qui signale.
        </p>
```

3. Dans « Durée de conservation », ajouter à la liste :

```tsx
          <li>
            Signalements : conservés pour la sécurité de la plateforme ; le lien avec le compte
            signaleur est supprimé lorsque ce compte est supprimé.
          </li>
```

- [ ] **Step 5 : Vérifier**

Run : `npx tsc --noEmit` puis `npm run check`
Expected : aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/components/reports/SuspensionBanner.tsx src/app/partenaire/page.tsx src/app/api/mon-compte/export/route.ts src/app/confidentialite/page.tsx
git commit -m "feat(signalement): profils suspendus côté partenaire, export et confidentialité

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7 : Administration

**Files :**
- Create : `src/components/reports/ReportReview.tsx`
- Create : `src/components/reports/AdminReportsSection.tsx`
- Modify : `src/app/admin/page.tsx`

**Interfaces :**
- Consumes : `reviewReport` (Task 4) ; `INITIAL_REVIEW_REPORT_STATE`, `MAX_RESOLUTION_NOTE` (Task 1) ; RPC `admin_list_open_reports` et `OpenReportRow` (Task 3) ; `createAdminClient` ; `reportReason` ; `cityLabel`.
- Produces : section « Signalements » en tête de `/admin` ; boutons « Signalement infondé », « Retirer le profil », « Personne mineure : bloquer le compte », « Confirmer le blocage », « Annuler » ; champ « Note de décision ».

- [ ] **Step 1 : Écrire le composant de décision**

`src/components/reports/ReportReview.tsx` :

```tsx
"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Archive, ShieldX, X } from "lucide-react";

import { reviewReport } from "@/app/actions/reports";
import { INITIAL_REVIEW_REPORT_STATE, MAX_RESOLUTION_NOTE } from "@/lib/reports";

export function ReportReview({ reportId }: { reportId: string }) {
  const [state, formAction, pending] = useActionState(reviewReport, INITIAL_REVIEW_REPORT_STATE);
  const [confirmBlock, setConfirmBlock] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="report_id" value={reportId} />

      <div className="space-y-1.5">
        <label htmlFor={`note-${reportId}`} className="text-xs font-medium text-slate-400">
          Note de décision
        </label>
        <input
          id={`note-${reportId}`}
          name="note"
          type="text"
          maxLength={MAX_RESOLUTION_NOTE}
          placeholder="Obligatoire pour retirer le profil"
          // Plusieurs boutons partagent ce formulaire : Entrée soumettrait le
          // premier d'entre eux, sans que la décision ait été choisie.
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-slate-600"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="dismiss"
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          <X className="size-4" aria-hidden />
          Signalement infondé
        </button>
        <button
          type="submit"
          name="decision"
          value="remove"
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-400/30 px-3 text-sm text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
        >
          <Archive className="size-4" aria-hidden />
          Retirer le profil
        </button>
      </div>

      {confirmBlock ? (
        <div className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <p className="text-sm text-red-100">
            Tous les profils du compte seront archivés et suspendus, le compte sera bloqué et sa
            vérification d&apos;identité retirée.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              name="decision"
              value="block_minor"
              disabled={pending}
              className="inline-flex h-9 items-center rounded-lg bg-red-500 px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirmer le blocage
            </button>
            <button
              type="button"
              onClick={() => setConfirmBlock(false)}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-slate-300 hover:bg-white/[0.06]"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmBlock(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-red-300 transition hover:bg-red-500/10"
        >
          <ShieldX className="size-4" aria-hidden />
          Personne mineure : bloquer le compte
        </button>
      )}

      {state.status === "error" && state.message && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2 : Écrire la section d'administration**

`src/components/reports/AdminReportsSection.tsx` :

```tsx
import Image from "next/image";
import { MapPin } from "lucide-react";

import { ReportReview } from "@/components/reports/ReportReview";
import { cx } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cityLabel } from "@/types/listing";
import { reportReason } from "@/types/reports";
import type { OpenReportRow } from "@/types/database";

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Précondition : l'appelant a vérifié `is_admin()`. Les adresses e-mail et les
 * blocages sont lus avec service_role ; ils ne quittent pas le serveur.
 */
export async function AdminReportsSection() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_open_reports");

  if (error) {
    console.error("[admin] reports list failed", error);
    return (
      <section className="mb-14">
        <h2 className="text-xl font-semibold tracking-tight text-white">Signalements</h2>
        <p role="alert" className="mt-3 text-sm text-red-300">
          Impossible de charger les signalements. Rechargez la page.
        </p>
      </section>
    );
  }

  const reports: OpenReportRow[] = data ?? [];
  const urgentCount = reports.filter((report) => report.is_urgent).length;

  const admin = createAdminClient();
  const userIds = [
    ...new Set(reports.flatMap((report) => [report.reporter_id, report.owner_id]).filter((id): id is string => id !== null)),
  ];
  const emails = new Map(
    await Promise.all(
      userIds.map(async (id) => {
        const { data: result, error: userError } = await admin.auth.admin.getUserById(id);
        if (userError) return [id, "Adresse indisponible"] as const;
        return [id, result.user?.email ?? "Compte supprimé"] as const;
      }),
    ),
  );

  const ownerIds = [...new Set(reports.map((report) => report.owner_id).filter((id): id is string => id !== null))];
  const { data: blocks } = ownerIds.length
    ? await admin.from("verification_blocks").select("user_id").in("user_id", ownerIds)
    : { data: [] as { user_id: string }[] };
  const blocked = new Set((blocks ?? []).map((block) => block.user_id));
  const now = new Date();

  const ownerState = (report: OpenReportRow): string => {
    if (!report.owner_id) return "Compte supprimé";
    if (blocked.has(report.owner_id)) return "Compte bloqué";
    if (report.listing_is_verified) return "Identité vérifiée";
    if (report.listing_grace_until && new Date(report.listing_grace_until) > now) return "En délai de grâce";
    return "Non vérifié";
  };

  return (
    <section className="mb-14">
      <h2 className="text-xl font-semibold tracking-tight text-white">Signalements</h2>
      <p className="mb-5 mt-1.5 text-sm leading-relaxed text-slate-400">
        {reports.length} signalement{reports.length > 1 ? "s" : ""} ouvert{reports.length > 1 ? "s" : ""}, dont{" "}
        {urgentCount} urgent{urgentCount > 1 ? "s" : ""}.
      </p>

      {reports.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
          Aucun signalement ouvert.
        </p>
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => (
            <li
              key={report.id}
              className={cx(
                "grid gap-5 rounded-2xl border bg-white/[0.03] p-4 md:grid-cols-2",
                report.is_urgent ? "border-red-500/40" : "border-white/10",
              )}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {report.is_urgent && (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                      Urgent
                    </span>
                  )}
                  <span className="text-sm font-medium text-white">
                    {reportReason(report.reason)?.label ?? report.reason}
                  </span>
                  <span className="text-xs text-slate-500">{dateFr(report.created_at)}</span>
                </div>

                {report.details && (
                  <p className="whitespace-pre-line text-sm text-slate-300">{report.details}</p>
                )}

                {report.listing_id ? (
                  <div className="flex gap-3">
                    {report.listing_cover_url && (
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg">
                        <Image src={report.listing_cover_url} alt="" fill sizes="64px" className="object-cover" />
                      </div>
                    )}
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-white">{report.listing_title}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-400">
                        <MapPin className="size-3 shrink-0" aria-hidden />
                        {report.listing_city ? cityLabel(report.listing_city) : ""}
                        {report.listing_suspended_at && (
                          <span className="ml-1 rounded-full bg-red-500/15 px-1.5 text-[10px] text-red-300">Suspendu</span>
                        )}
                      </p>
                      {report.listing_description && (
                        <p className="line-clamp-3 text-xs text-slate-500">{report.listing_description}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Profil supprimé</p>
                )}

                <dl className="space-y-1 text-xs text-slate-400">
                  <div>
                    <dt className="inline text-slate-500">Signalements ouverts sur ce profil : </dt>
                    <dd className="inline">{report.open_reports_on_listing}</dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-500">Propriétaire : </dt>
                    <dd className="inline">
                      {report.owner_id ? emails.get(report.owner_id) : "—"} · {ownerState(report)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-500">Signalé par : </dt>
                    <dd className="inline">{report.reporter_id ? emails.get(report.reporter_id) : "Compte supprimé"}</dd>
                  </div>
                </dl>
              </div>

              <ReportReview reportId={report.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3 : Placer la section en tête de `/admin`**

Dans `src/app/admin/page.tsx` :

1. Ajouter l'import : `import { AdminReportsSection } from "@/components/reports/AdminReportsSection";`
2. Juste avant `<AdminVerificationSection page={verifiedPage} />`, ajouter :

```tsx
        <AdminReportsSection />
```

- [ ] **Step 4 : Vérifier**

Run : `npx tsc --noEmit`, `npm run check`, puis `npm run build 2>&1 | tail -20`
Expected : aucune erreur, build réussi.

- [ ] **Step 5 : Commit**

```bash
git add src/components/reports/ReportReview.tsx src/components/reports/AdminReportsSection.tsx src/app/admin/page.tsx
git commit -m "feat(signalement): traitement des signalements dans l'administration

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8 : Tests de bout en bout

**Files :**
- Create : `e2e/signalement.spec.ts`

**Interfaces :**
- Consumes : helpers existants `ADMIN_EMAIL`, `TEST_PASSWORD`, `gotoReady`, `publishListing(page, { city })`, `signIn`, `signUpPartner` (`e2e/helpers.ts`) ; textes des Tasks 5, 6 et 7.

- [ ] **Step 1 : Écrire les tests**

`e2e/signalement.spec.ts` :

```ts
import { expect, test, type Page } from "@playwright/test";

import { ADMIN_EMAIL, gotoReady, publishListing, signIn, signUpPartner, TEST_PASSWORD } from "./helpers";

/**
 * Ville sans profil de démonstration : le fil filtré reste court, le profil
 * créé par le test est donc toujours sur la première page.
 */
const CITY = "ouesso";

async function slugOf(page: Page, titre: string): Promise<string> {
  const href = await page.locator('a[href^="/annonces/"]', { hasText: titre }).first().getAttribute("href");
  if (!href) throw new Error(`lien du profil introuvable : ${titre}`);
  return href.replace("/annonces/", "");
}

test.describe("Signalement d'annonces", () => {
  test("un visiteur non connecté se connecte puis revient au formulaire", async ({ page, browser }) => {
    await signUpPartner(page);
    const titre = await publishListing(page, { city: CITY });
    const slug = await slugOf(page, titre);

    const reporterContext = await browser.newContext();
    const reporterPage = await reporterContext.newPage();
    const reporterEmail = await signUpPartner(reporterPage);
    await reporterContext.close();

    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(`/signaler/${slug}`);
    await expect(visitor).toHaveURL(/\/connexion\?suivant=(%2F|\/)signaler(%2F|\/)/);

    // Arrivée par redirection : `gotoReady` ne s'applique pas, on attend donc
    // explicitement l'hydratation avant de cliquer (même signal que gotoReady).
    await visitor.waitForFunction(
      () => Object.keys(document.body).some((key) => key.startsWith("__reactFiber$")),
      undefined,
      { timeout: 15_000 },
    );
    await visitor.getByLabel("Adresse e-mail").fill(reporterEmail);
    await visitor.getByLabel("Mot de passe").fill(TEST_PASSWORD);
    await visitor.getByRole("button", { name: "Se connecter" }).click();

    await visitor.waitForURL(`**/signaler/${slug}`, { timeout: 15_000 });
    await expect(visitor.getByRole("heading", { name: "Signaler un profil" })).toBeVisible();
    await visitorContext.close();
  });

  test("signalement urgent : profil masqué, suspendu, puis rétabli par l'équipe", async ({ page, browser }) => {
    await signUpPartner(page);
    const titre = await publishListing(page, { city: CITY });
    const slug = await slugOf(page, titre);

    const reporterContext = await browser.newContext();
    const reporter = await reporterContext.newPage();
    await signUpPartner(reporter);
    await gotoReady(reporter, `/signaler/${slug}`);
    await reporter.getByRole("radio", { name: /Personne mineure présumée/ }).check();
    await reporter.getByLabel("Précisions").fill("Le profil semble concerner une adolescente.");
    await reporter.getByRole("button", { name: "Envoyer le signalement" }).click();
    await expect(reporter.getByRole("heading", { name: "Signalement transmis" })).toBeVisible();

    await gotoReady(reporter, `/?city=${CITY}`);
    await expect(reporter.getByText(titre)).toBeHidden();

    await gotoReady(page, "/partenaire");
    await expect(page.getByText("Suspendu").first()).toBeVisible();
    await expect(page.getByText("Un de vos profils est suspendu le temps d'un examen par l'équipe Matripa.")).toBeVisible();

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, ADMIN_EMAIL);
    await gotoReady(admin, "/admin");

    // Le titre apparaît aussi dans la liste « Mise en avant VIP » : on cible la
    // carte qui porte les boutons de décision.
    const card = admin
      .locator("li", { hasText: titre })
      .filter({ has: admin.getByRole("button", { name: "Signalement infondé" }) });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Signalement infondé" }).click();
    await expect(card).toBeHidden();
    await adminContext.close();

    await gotoReady(reporter, `/?city=${CITY}`);
    await expect(reporter.getByText(titre)).toBeVisible();
    await reporterContext.close();
  });
});
```

- [ ] **Step 2 : Exécuter la nouvelle spec**

Run : `npx playwright test e2e/signalement.spec.ts`
Expected : PASS (2 tests). En cas d'échec sur la visibilité du profil dans le fil après la décision, vérifier que `reviewReport` appelle `revalidateTag(LISTINGS_TAG)` et que le test navigue avec `gotoReady` (pas de `page.goto` suivi d'un clic).

- [ ] **Step 3 : Suite complète**

Run : `npm run test:e2e 2>&1 | tail -30`
Expected : 32 tests verts (30 existants + 2).

- [ ] **Step 4 : Commit**

```bash
git add e2e/signalement.spec.ts
git commit -m "test(signalement): parcours de bout en bout

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9 : Documentation et vérification finale

**Files :**
- Modify : `README.md`

- [ ] **Step 1 : Mettre à jour le README**

1. « Structure » : ajouter `    signaler/[slug]/             Signalement d'un profil (compte connecté)` sous `demande/[slug]/`, et `  tests/reports.test.sql` à côté des autres fichiers pgTAP ; `migrations/ 0001 → 0012`.
2. « Modèle de sécurité », tableau : ajouter

```markdown
| `listing_reports` | personne en direct → `submit_report()` ; décisions → `review_report()` (admins) ; lecture admin → `admin_list_open_reports()` |
| `suspended_at` | aucun rôle client — posée par un signalement urgent ou un retrait, levée par une décision « infondé » |
```

3. « Tests » : mettre à jour les compteurs avec les totaux réels (Vitest, pgTAP = 34 + 56 + 40, Playwright = 32).
4. Ajouter, après la section « Vérification d'identité », la section :

```markdown
## Signalements

Un compte connecté peut signaler un profil visible depuis sa fiche (« Signaler ce profil » → `/signaler/[slug]`). Cinq motifs : personne mineure présumée, contrainte ou exploitation, faux profil ou photos volées, arnaque, autre.

### Ce qui se passe

- **Motif urgent** (mineure, contrainte) : `submit_report` renseigne `listings.suspended_at` dans la même transaction. Le profil disparaît du catalogue — la policy `listings_public_read` exige `suspended_at is null` — et `submit_request` comme `create_payment` le refusent. L'équipe reçoit un e-mail (`REPORT_ALERT_EMAILS`), sans identité du signaleur ni précisions.
- **Autres motifs** : aucun effet immédiat ; le signalement attend dans `/admin`.
- **Pas de suivi** : le signaleur voit une confirmation, puis rien. Les GRANT de colonne l'empêchent de lire `status` et la note de décision.

### Anti-abus

Un signalement ouvert par compte et par profil, cinq par heure par compte, jamais sur son propre profil. Chaque décision est journalisée dans `moderation_log`.

### Décisions (`/admin`, en tête)

| Décision | Effet |
|---|---|
| Signalement infondé | Clos ; la suspension tombe si plus aucun signalement urgent n'est ouvert sur ce profil |
| Retirer le profil (note obligatoire) | Profil archivé et suspendu définitivement ; autres signalements du profil clos |
| Personne mineure : bloquer le compte | Tous les profils archivés et suspendus, compte inscrit dans `verification_blocks`, vérification révoquée ou rejetée, signalements du compte clos |

Le partenaire voit « Suspendu » sur son tableau de bord, sans motif ni signaleur. Republier ne lève pas la suspension : `suspended_at` est hors de ses droits d'écriture.

### Configuration

`REPORT_ALERT_EMAILS` : adresses de l'équipe, séparées par des virgules. Sans elle (ou sans `RESEND_API_KEY` / `NOTIFY_EMAIL_FROM`), le signalement est enregistré et un avertissement est journalisé.
```

5. « Déploiement › Procédure » : après la mention de la migration 0011, ajouter « La migration 0012 crée la table des signalements et ajoute `listings.suspended_at`. Renseigner `REPORT_ALERT_EMAILS`. »

- [ ] **Step 2 : Vérification complète**

```bash
npm run check
supabase db reset && npm run test:db
npm run test:e2e
npm run build
```

Expected : tout vert — Vitest (67 + tests de `reports.test.ts`), pgTAP 130, Playwright 32, build OK.

- [ ] **Step 3 : Contrôle des fichiers**

```bash
git status --short
```

Expected : propre.

- [ ] **Step 4 : Commit**

```bash
git add README.md
git commit -m "docs: documenter le signalement d'annonces

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
