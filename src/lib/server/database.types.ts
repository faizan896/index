/**
 * Supabase types for the schema in supabase/migrations.
 *
 * Hand-maintained to match the migrations exactly. After changing the schema
 * you can regenerate an equivalent file with:
 *   npx supabase gen types typescript --project-id <ref> --schema public
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type ReadingStatus = "unread" | "reading" | "finished";
type ProcessingStatus = "pending" | "processing" | "done" | "failed" | "skipped";
type AssignmentSource = "ai" | "user" | "import";

export interface SavedLinkRow {
  id: string;
  user_id: string;
  url: string;
  normalized_url: string;
  domain: string;
  resolved_url: string | null;
  canonical_url: string | null;
  canonical_normalized_url: string | null;
  title: string | null;
  description: string | null;
  author: string | null;
  site_name: string | null;
  published_at: string | null;
  reading_minutes: number | null;
  word_count: number | null;
  lang: string | null;
  content_type: string | null;
  content_excerpt: string | null;
  status: ReadingStatus;
  status_changed_at: string | null;
  finished_at: string | null;
  is_favorite: boolean;
  favorited_at: string | null;
  metadata_status: ProcessingStatus;
  metadata_error: string | null;
  fetched_at: string | null;
  classification_status: ProcessingStatus;
  classification_error: string | null;
  classified_at: string | null;
  ai_model: string | null;
  processing_started_at: string | null;
  suggested_collection_ids: string[];
  taxonomy_text: string;
  notes_text: string;
  search_vector: unknown;
  created_at: string;
  updated_at: string;
}

type SavedLinkInsert = Partial<Omit<SavedLinkRow, "url" | "normalized_url" | "domain">> &
  Pick<SavedLinkRow, "url" | "normalized_url" | "domain">;

export interface ListLinksRow {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  author: string | null;
  site_name: string | null;
  published_at: string | null;
  reading_minutes: number | null;
  status: ReadingStatus;
  is_favorite: boolean;
  created_at: string;
  metadata_status: ProcessingStatus;
  classification_status: ProcessingStatus;
  categories: Json;
  tags: Json;
  rank: number;
  total_count: number;
}

export interface Database {
  public: {
    Tables: {
      user_settings: {
        Row: { user_id: string; ai_enabled: boolean; created_at: string; updated_at: string };
        Insert: { user_id?: string; ai_enabled?: boolean; created_at?: string; updated_at?: string };
        Update: { user_id?: string; ai_enabled?: boolean; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      saved_links: {
        Row: SavedLinkRow;
        Insert: SavedLinkInsert;
        Update: Partial<SavedLinkRow>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          slug: string;
          created_by: AssignmentSource;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          slug: string;
          created_by?: AssignmentSource;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          slug?: string;
          created_by?: AssignmentSource;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      link_categories: {
        Row: {
          link_id: string;
          category_id: string;
          user_id: string;
          source: AssignmentSource;
          created_at: string;
        };
        Insert: {
          link_id: string;
          category_id: string;
          user_id?: string;
          source?: AssignmentSource;
          created_at?: string;
        };
        Update: {
          link_id?: string;
          category_id?: string;
          user_id?: string;
          source?: AssignmentSource;
          created_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: { id: string; user_id: string; name: string; slug: string; created_at: string };
        Insert: { id?: string; user_id?: string; name: string; slug: string; created_at?: string };
        Update: { id?: string; user_id?: string; name?: string; slug?: string; created_at?: string };
        Relationships: [];
      };
      link_tags: {
        Row: { link_id: string; tag_id: string; user_id: string; source: AssignmentSource; created_at: string };
        Insert: {
          link_id: string;
          tag_id: string;
          user_id?: string;
          source?: AssignmentSource;
          created_at?: string;
        };
        Update: {
          link_id?: string;
          tag_id?: string;
          user_id?: string;
          source?: AssignmentSource;
          created_at?: string;
        };
        Relationships: [];
      };
      collections: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      collection_links: {
        Row: { collection_id: string; link_id: string; user_id: string; added_at: string };
        Insert: { collection_id: string; link_id: string; user_id?: string; added_at?: string };
        Update: { collection_id?: string; link_id?: string; user_id?: string; added_at?: string };
        Relationships: [];
      };
      notes: {
        Row: { id: string; link_id: string; user_id: string; body: string; created_at: string; updated_at: string };
        Insert: {
          id?: string;
          link_id: string;
          user_id?: string;
          body: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          link_id?: string;
          user_id?: string;
          body?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      classification_cache: {
        Row: { user_id: string; cache_key: string; model: string; result: Json; created_at: string };
        Insert: { user_id?: string; cache_key: string; model: string; result: Json; created_at?: string };
        Update: { user_id?: string; cache_key?: string; model?: string; result?: Json; created_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      save_link: {
        Args: { p_url: string; p_normalized_url: string; p_domain: string; p_title?: string | null };
        Returns: { link_id: string; duplicate: boolean }[];
      };
      list_links: {
        Args: {
          p_query?: string | null;
          p_status?: ReadingStatus | null;
          p_favorite?: boolean | null;
          p_category_id?: string | null;
          p_tag_id?: string | null;
          p_collection_id?: string | null;
          p_domain?: string | null;
          p_unsorted?: boolean;
          p_saved_from?: string | null;
          p_saved_to?: string | null;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: ListLinksRow[];
      };
      library_stats: { Args: Record<string, never>; Returns: Json };
      category_summaries: {
        Args: Record<string, never>;
        Returns: { id: string; name: string; slug: string; link_count: number; created_at: string }[];
      };
      collection_summaries: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          description: string | null;
          link_count: number;
          created_at: string;
          updated_at: string;
        }[];
      };
      source_summaries: {
        Args: { p_limit?: number };
        Returns: { domain: string; site_name: string | null; link_count: number }[];
      };
      apply_classification: {
        Args: {
          p_link_id: string;
          p_categories: Json;
          p_tags: Json;
          p_collection_ids?: string[];
          p_model?: string | null;
        };
        Returns: undefined;
      };
      set_link_categories: { Args: { p_link_id: string; p_categories: Json }; Returns: undefined };
      add_link_tag: {
        Args: { p_link_id: string; p_name: string; p_slug: string };
        Returns: { id: string; name: string; slug: string }[];
      };
      merge_categories: { Args: { p_source_id: string; p_target_id: string }; Returns: undefined };
      related_links: {
        Args: { p_link_id: string; p_limit?: number };
        Returns: {
          id: string;
          url: string;
          domain: string;
          title: string | null;
          site_name: string | null;
          status: ReadingStatus;
          created_at: string;
          score: number;
          shared_categories: string[];
          shared_tags: string[];
        }[];
      };
      rediscover: {
        Args: { p_seed?: string };
        Returns: {
          kind: string;
          id: string;
          url: string;
          domain: string;
          title: string | null;
          description: string | null;
          author: string | null;
          site_name: string | null;
          reading_minutes: number | null;
          status: ReadingStatus;
          is_favorite: boolean;
          created_at: string;
        }[];
      };
      import_links: { Args: { p_rows: Json }; Returns: Json };
      export_library: { Args: Record<string, never>; Returns: Json };
      get_link_item: { Args: { p_link_id: string }; Returns: ListLinksRow[] };
      link_detail: { Args: { p_link_id: string }; Returns: Json };
      claim_link_processing: {
        Args: { p_link_id: string; p_force?: boolean };
        Returns: SavedLinkRow[];
      };
    };
    Enums: {
      reading_status: ReadingStatus;
      processing_status: ProcessingStatus;
      assignment_source: AssignmentSource;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
