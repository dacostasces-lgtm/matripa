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
