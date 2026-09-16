// src/types/index.ts

// Re‑export des types existants
export * from "./listing";
export * from "./database";

// ---------------------------------------------------------------------------
// Types relatifs aux utilisateurs
// ---------------------------------------------------------------------------
export type UserRole = "member" | "certified" | "vip";

export interface User {
  id: string;
  name: string;
  avatar_url: string;
  role: UserRole;
  created_at: string;
  email?: string;
  wallet_balance_xaf?: number;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  amount_xaf: number;
  type: "credit" | "debit";
  description: string;
  created_at: string;
}
