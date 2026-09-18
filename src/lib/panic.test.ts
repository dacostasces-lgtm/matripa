import { describe, expect, it, vi } from "vitest";

import { PANIC_EXIT_URL, isDoubleTap, panicExit } from "@/lib/panic";

describe("Bouton de panique", () => {
  it("remplace la page courante par news.google.com, sans la laisser dans l'historique", () => {
    const location = { replace: vi.fn() };

    panicExit(location);

    expect(location.replace).toHaveBeenCalledOnce();
    expect(location.replace).toHaveBeenCalledWith("https://news.google.com");
    expect(PANIC_EXIT_URL).toBe("https://news.google.com");
  });
});

describe("Raccourci double Échap", () => {
  it("déclenche sur deux appuis rapprochés", () => {
    expect(isDoubleTap(1_000, 1_400)).toBe(true);
  });

  it("ignore deux appuis trop espacés, ou un premier appui", () => {
    expect(isDoubleTap(1_000, 1_600)).toBe(false);
    expect(isDoubleTap(null, 1_000)).toBe(false);
  });
});
