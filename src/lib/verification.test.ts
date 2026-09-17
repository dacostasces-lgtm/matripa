import { describe, expect, it } from "vitest";

import {
  checkVideo,
  completeRows,
  graceSummary,
  hasAllApprovalChecks,
  MAX_VIDEO_BYTES,
  planVideoPurge,
  verificationErrorCode,
  verificationErrorMessage,
  verificationVideoPath,
  verificationView,
} from "@/lib/verification";
import { isRejectionReason, isVerificationDecision, isVerificationDocument } from "@/types/verification";

const NOW = new Date("2026-09-16T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("checkVideo", () => {
  it("accepte une vidéo MP4 de 15 s et renvoie son extension", () => {
    expect(checkVideo({ type: "video/mp4", size: 30_000_000 }, 15)).toEqual({ ok: true, extension: "mp4" });
  });

  it("associe chaque type autorisé à son extension", () => {
    expect(checkVideo({ type: "video/quicktime", size: 1 }, 1)).toEqual({ ok: true, extension: "mov" });
    expect(checkVideo({ type: "video/webm", size: 1 }, 1)).toEqual({ ok: true, extension: "webm" });
    expect(checkVideo({ type: "video/3gpp", size: 1 }, 1)).toEqual({ ok: true, extension: "3gp" });
  });

  it("refuse un type non vidéo", () => {
    expect(checkVideo({ type: "image/png", size: 1 }, null).ok).toBe(false);
  });

  it("refuse un fichier vide", () => {
    expect(checkVideo({ type: "video/mp4", size: 0 }, 5).ok).toBe(false);
  });

  it("accepte exactement 50 Mo et refuse au-delà", () => {
    expect(checkVideo({ type: "video/mp4", size: MAX_VIDEO_BYTES }, 10).ok).toBe(true);
    expect(checkVideo({ type: "video/mp4", size: MAX_VIDEO_BYTES + 1 }, 10).ok).toBe(false);
  });

  it("accepte exactement 20 s et refuse au-delà", () => {
    expect(checkVideo({ type: "video/mp4", size: 1 }, 20).ok).toBe(true);
    expect(checkVideo({ type: "video/mp4", size: 1 }, 20.5).ok).toBe(false);
  });

  it("accepte une durée illisible, la taille restant plafonnée", () => {
    expect(checkVideo({ type: "video/mp4", size: 1 }, null).ok).toBe(true);
  });
});

describe("verificationVideoPath", () => {
  it("range la vidéo dans le dossier du compte, nommée d'après la demande", () => {
    expect(verificationVideoPath("u-1", "r-2", "mov")).toBe("u-1/r-2.mov");
  });
});

describe("verificationErrorCode / verificationErrorMessage", () => {
  it("reconnaît un code dans le message Postgres", () => {
    expect(verificationErrorCode("code_expired")).toBe("code_expired");
    expect(verificationErrorCode('new row: verification_required')).toBe("verification_required");
  });

  it("ne confond pas un message inconnu avec un code", () => {
    expect(verificationErrorCode("toString")).toBeNull();
    expect(verificationErrorCode(undefined)).toBeNull();
  });

  it("renvoie un message de repli pour une erreur inconnue", () => {
    expect(verificationErrorMessage("boom")).toBe("Une erreur est survenue. Réessayez dans un instant.");
  });

  it("traduit un refus de publication", () => {
    expect(verificationErrorMessage("verification_required")).toContain("Vérifiez votre identité");
  });
});

describe("verificationView", () => {
  const base = { code_expires_at: hoursAgo(-0.25), rejection_reason: null };

  it("propose de commencer sans demande", () => {
    expect(verificationView(null, NOW)).toBe("start");
  });

  it("affiche l'envoi tant que le code est valide, puis l'expiration", () => {
    expect(verificationView({ ...base, status: "awaiting_video" }, NOW)).toBe("upload");
    expect(verificationView({ ...base, status: "awaiting_video", code_expires_at: hoursAgo(1) }, NOW)).toBe("expired");
  });

  it("reflète les états terminaux", () => {
    expect(verificationView({ ...base, status: "pending" }, NOW)).toBe("pending");
    expect(verificationView({ ...base, status: "approved" }, NOW)).toBe("approved");
    expect(verificationView({ ...base, status: "revoked" }, NOW)).toBe("revoked");
    expect(verificationView({ ...base, status: "rejected", rejection_reason: "video_illisible" }, NOW)).toBe("rejected");
  });

  it("présente un constat de minorité comme un blocage", () => {
    expect(verificationView({ ...base, status: "rejected", rejection_reason: "personne_mineure" }, NOW)).toBe("blocked");
  });
});

describe("graceSummary", () => {
  it("renvoie la plus proche échéance future et le nombre d'annonces concernées", () => {
    const soon = new Date(NOW.getTime() + 86_400_000).toISOString();
    const later = new Date(NOW.getTime() + 3 * 86_400_000).toISOString();

    const summary = graceSummary(
      [
        { status: "published", is_verified: false, verification_grace_until: later },
        { status: "published", is_verified: false, verification_grace_until: soon },
        { status: "published", is_verified: false, verification_grace_until: hoursAgo(1) },
        { status: "draft", is_verified: false, verification_grace_until: soon },
        { status: "published", is_verified: true, verification_grace_until: null },
      ],
      NOW,
    );

    expect(summary).toEqual({ deadline: new Date(soon), count: 2 });
  });

  it("renvoie null sans annonce en délai de grâce", () => {
    expect(graceSummary([], NOW)).toBeNull();
  });
});

describe("hasAllApprovalChecks", () => {
  it("exige les quatre contrôles", () => {
    const fd = new FormData();
    fd.set("check_face", "on");
    fd.set("check_document", "on");
    fd.set("check_age", "on");
    expect(hasAllApprovalChecks(fd)).toBe(false);

    fd.set("check_code", "on");
    expect(hasAllApprovalChecks(fd)).toBe(true);
  });
});

describe("planVideoPurge", () => {
  it("conserve les vidéos en examen, purge celles déjà jugées et les orphelines de plus de 24 h", () => {
    const plan = planVideoPurge(
      [
        { path: "u/pending.mp4", createdAt: hoursAgo(72) },
        { path: "u/approved.mp4", createdAt: hoursAgo(1) },
        { path: "u/orphan-old.mp4", createdAt: hoursAgo(25) },
        { path: "u/orphan-new.mp4", createdAt: hoursAgo(2) },
      ],
      [
        { id: "p", status: "pending", video_path: "u/pending.mp4" },
        { id: "a", status: "approved", video_path: "u/approved.mp4" },
        { id: "r", status: "rejected", video_path: "u/deja-supprimee.mp4" },
      ],
      NOW,
    );

    expect(plan.paths.sort()).toEqual(["u/approved.mp4", "u/orphan-old.mp4"]);
    expect(plan.clearRequestIds.sort()).toEqual(["a", "r"]);
  });
});

describe("completeRows", () => {
  it("renvoie les lignes quand le nombre exact correspond", () => {
    expect(completeRows({ data: [1, 2], error: null, count: 2 })).toEqual([1, 2]);
    expect(completeRows({ data: null, error: null, count: 0 })).toEqual([]);
  });

  it("rejette une lecture en échec", () => {
    expect(completeRows({ data: null, error: { message: "boom" }, count: null })).toBeNull();
  });

  it("rejette une lecture sans nombre exact", () => {
    expect(completeRows({ data: [1], error: null, count: null })).toBeNull();
  });

  it("rejette une lecture tronquée par max_rows", () => {
    expect(completeRows({ data: [1, 2], error: null, count: 1500 })).toBeNull();
  });
});

describe("gardes de type", () => {
  it("valident les slugs du domaine", () => {
    expect(isVerificationDocument("passeport")).toBe(true);
    expect(isVerificationDocument("permis")).toBe(false);
    expect(isRejectionReason("personne_mineure")).toBe(true);
    expect(isRejectionReason("autre")).toBe(false);
    expect(isVerificationDecision("block_minor")).toBe(true);
    expect(isVerificationDecision("delete")).toBe(false);
  });
});
