import { describe, expect, it } from "vitest";

import { isPawaPayProvider, toLocalStatus, toMsisdn } from "@/lib/pawapay-shared";

describe("toMsisdn", () => {
  it("préfixe l'indicatif congolais sur un numéro national", () => {
    expect(toMsisdn("06 123 45 67")).toBe("242061234567");
  });

  it("accepte un numéro déjà international, avec ou sans +", () => {
    expect(toMsisdn("+242 06 123 45 67")).toBe("242061234567");
    expect(toMsisdn("242061234567")).toBe("242061234567");
  });

  it("ignore séparateurs et espaces insécables", () => {
    expect(toMsisdn("06-12.34 56 7")).toBe("242061234567");
  });

  it("rejette un nombre de chiffres incorrect", () => {
    // Les mobiles congolais comptent 9 chiffres : plus court ou plus long est
    // une saisie erronée, qu'il vaut mieux refuser que transmettre.
    expect(toMsisdn("06 123 45")).toBeNull();
    expect(toMsisdn("06 123 45 67 89")).toBeNull();
    expect(toMsisdn("")).toBeNull();
  });
});

describe("toLocalStatus", () => {
  it("ne traite pas IN_RECONCILIATION comme un échec", () => {
    // pawaPay n'a pas tranché : conclure à l'échec ferait redemander de
    // l'argent à un client peut-être déjà débité.
    expect(toLocalStatus("IN_RECONCILIATION")).toBe("processing");
  });

  it("mappe les issues définitives", () => {
    expect(toLocalStatus("COMPLETED")).toBe("completed");
    expect(toLocalStatus("FAILED")).toBe("failed");
    expect(toLocalStatus("REJECTED")).toBe("failed");
  });

  it("considère un doublon ignoré comme en cours, pas comme un échec", () => {
    // DUPLICATE_IGNORED signifie que le dépôt d'origine suit son cours.
    expect(toLocalStatus("DUPLICATE_IGNORED")).toBe("processing");
  });

  it("mappe les états intermédiaires", () => {
    expect(toLocalStatus("ACCEPTED")).toBe("processing");
    expect(toLocalStatus("PROCESSING")).toBe("processing");
  });
});

describe("isPawaPayProvider", () => {
  it("n'accepte que les opérateurs couvrant le Congo", () => {
    expect(isPawaPayProvider("MTN_MOMO_COG")).toBe(true);
    expect(isPawaPayProvider("AIRTEL_COG")).toBe(true);
    expect(isPawaPayProvider("MTN_MOMO_RWA")).toBe(false);
    expect(isPawaPayProvider("")).toBe(false);
    expect(isPawaPayProvider(null)).toBe(false);
  });
});
