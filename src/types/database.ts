import type { Listing } from "./listing";
import type {
  VerificationDecision,
  VerificationDocument,
  VerificationRejection,
  VerificationStatus,
} from "./verification";
import type { ReportDecision, ReportReason, ReportStatus } from "./reports";

export type ListingStatus = "draft" | "published" | "archived";
export type RequestStatus = "pending" | "contacted" | "confirmed" | "cancelled";
export type PaymentStatus = "pending" | "processing" | "completed" | "failed";
export type PaymentProvider = "MTN_MOMO_COG" | "AIRTEL_COG";

export type PaymentRow = {
  id: string;
  request_id: string;
  listing_id: string;
  payer_id: string | null;
  amount_xaf: number;
  currency: string;
  provider: PaymentProvider;
  phone: string;
  status: PaymentStatus;
  failure_code: string | null;
  provider_txn_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewRow = {
  id: string;
  request_id: string;
  listing_id: string;
  author_id: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type VerificationRequestRow = {
  id: string;
  user_id: string;
  status: VerificationStatus;
  challenge_code: string;
  code_expires_at: string;
  document_type: VerificationDocument | null;
  video_path: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: VerificationRejection | null;
  rejection_note: string | null;
  created_at: string;
};

export type ListingReportRow = {
  id: string;
  listing_id: string | null;
  owner_id: string | null;
  reporter_id: string | null;
  reason: ReportReason;
  is_urgent: boolean;
  details: string | null;
  listing_title_snapshot: string | null;
  listing_description_snapshot: string | null;
  listing_cover_url_snapshot: string | null;
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
  /** Contenu du profil au moment du signalement : le partenaire a pu le modifier depuis. */
  snapshot_title: string | null;
  snapshot_description: string | null;
  snapshot_cover_url: string | null;
};

/**
 * Colonnes présentes en base mais absentes du modèle de domaine : elles
 * servent au filtrage/à la recherche, jamais à l'affichage.
 */
export type ListingRow = Listing & {
  status: ListingStatus;
  owner_id: string | null;
  /** Fin du délai de grâce d'une annonce publiée avant la vérification obligatoire. */
  verification_grace_until: string | null;
  /** Renseignée par un signalement urgent ou une décision de retrait ; masque le profil. */
  suspended_at: string | null;
  /** Colonne générée (tsvector) alimentant la recherche plein texte. */
  search_vector: string | null;
};

export type RequestRow = {
  id: string;
  listing_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  message: string;
  desired_date: string | null;
  guests: number | null;
  status: RequestStatus;
  author_id: string | null;
  created_at: string;
};

/**
 * Schéma minimal typé à la main. À remplacer par la génération automatique :
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 */
export interface Database {
  public: {
    Tables: {
      listings: {
        Row: ListingRow;
        /**
         * Seules les colonnes sans valeur par défaut sont requises. Les autres
         * — dont `is_vip`, `is_verified`, `rating` et `reviews_count`, que les
         * GRANT interdisent au rôle `authenticated` — restent facultatives et
         * sont renseignées par la base ou le back-office.
         */
        Insert: Pick<
          ListingRow,
          | "slug"
          | "title"
          | "category"
          | "option_type"
          | "mobility"
          | "city"
          | "price_xaf"
          | "cover_url"
        > &
          Partial<Omit<ListingRow, "search_vector">>;
        Update: Partial<Omit<ListingRow, "id" | "search_vector">>;
        // `Relationships` est requis par `GenericTable` : sans lui le schéma
        // ne satisfait pas la contrainte et postgrest-js retombe silencieusement
        // sur un typage permissif (rpc non typée, colonnes non vérifiées).
        Relationships: [];
      };
      requests: {
        Row: RequestRow;
        // L'insertion directe est révoquée : elle passe par `submit_request`.
        Insert: never;
        Update: Pick<Partial<RequestRow>, "status">;
        Relationships: [
          {
            foreignKeyName: "requests_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: ReviewRow;
        // L'insertion directe est révoquée : elle passe par `submit_review`,
        // qui vérifie qu'une prestation a réellement eu lieu.
        Insert: never;
        Update: Pick<Partial<ReviewRow>, "rating" | "comment">;
        Relationships: [
          {
            foreignKeyName: "reviews_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: PaymentRow;
        // L'insertion passe par `create_payment`, qui lit le montant sur
        // l'annonce au lieu de le recevoir du client.
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "payments_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_log: {
        Row: {
          id: string;
          review_id: string | null;
          listing_id: string | null;
          verification_id: string | null;
          report_id: string | null;
          action: "remove_review" | VerificationDecision | `report_${ReportDecision}`;
          moderator_id: string | null;
          reason: string | null;
          created_at: string;
        };
        // Écrit exclusivement par moderate_review, review_verification et review_report.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      verification_requests: {
        Row: VerificationRequestRow;
        // Écritures réservées aux fonctions `start_verification`,
        // `submit_verification` et `review_verification`.
        Insert: never;
        Update: never;
        Relationships: [];
      };
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
      admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { created_at?: string };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      set_listing_certification: {
        Args: {
          p_listing_id: string;
          p_is_verified: boolean | null;
          p_is_vip: boolean | null;
        };
        Returns: undefined;
      };
      create_payment: {
        Args: { p_request_id: string; p_provider: PaymentProvider; p_phone: string };
        Returns: { payment_id: string; amount_xaf: number }[];
      };
      settle_payment: {
        Args: {
          p_payment_id: string;
          p_status: PaymentStatus;
          p_failure_code?: string | null;
          p_provider_txn?: string | null;
        };
        Returns: undefined;
      };
      moderate_review: {
        Args: { p_review_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      submit_review: {
        Args: { p_request_id: string; p_rating: number; p_comment: string };
        Returns: string;
      };
      submit_request: {
        Args: {
          p_listing_id: string;
          p_full_name: string;
          p_phone: string;
          p_email: string | null;
          p_message: string;
          p_desired_date: string | null;
          p_guests: number | null;
        };
        Returns: string;
      };
      is_account_verified: { Args: { p_user_id: string }; Returns: boolean };
      is_verification_blocked: { Args: Record<string, never>; Returns: boolean };
      start_verification: {
        Args: Record<string, never>;
        Returns: { id: string; challenge_code: string; code_expires_at: string }[];
      };
      submit_verification: {
        Args: { p_id: string; p_document: VerificationDocument; p_video_path: string };
        Returns: undefined;
      };
      review_verification: {
        Args: {
          p_id: string;
          p_decision: VerificationDecision;
          p_reason?: VerificationRejection | null;
          p_note?: string | null;
        };
        Returns: string | null;
      };
      clear_verification_video: { Args: { p_id: string }; Returns: undefined };
      submit_report: {
        Args: { p_listing_id: string; p_reason: ReportReason; p_details: string | null };
        Returns: { id: string; is_urgent: boolean; listing_title: string; listing_city: string }[];
      };
      review_report: {
        Args: { p_report_id: string; p_decision: ReportDecision; p_note?: string | null };
        Returns: undefined;
      };
      admin_list_open_reports: { Args: Record<string, never>; Returns: OpenReportRow[] };
      account_has_open_moderation: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      listing_category: "categorie-a" | "categorie-b" | "categorie-c";
      listing_option: "option_1" | "option_2" | "option_3";
      listing_mobility: "sur_place" | "a_domicile" | "les_deux";
      listing_status: ListingStatus;
      request_status: RequestStatus;
      payment_status: PaymentStatus;
      payment_provider: PaymentProvider;
      identity_verification_status: VerificationStatus;
      identity_document_type: VerificationDocument;
      identity_rejection_reason: VerificationRejection;
      report_reason: ReportReason;
      report_status: ReportStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}
