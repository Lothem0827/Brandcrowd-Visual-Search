export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Relationships = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          handle: string;
          display_name: string;
          avatar_url: string | null;
          bio: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          handle: string;
          display_name?: string;
          avatar_url?: string | null;
          bio?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          handle?: string;
          display_name?: string;
          avatar_url?: string | null;
          bio?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: Relationships;
      };
      boards: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          is_public: boolean;
          slug: string;
          kind: "saved" | "custom";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description?: string | null;
          is_public?: boolean;
          slug: string;
          kind?: "saved" | "custom";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          description?: string | null;
          is_public?: boolean;
          slug?: string;
          kind?: "saved" | "custom";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: Relationships;
      };
      board_items: {
        Row: {
          board_id: string;
          template_id: string;
          position: number;
          created_at: string;
        };
        Insert: {
          board_id: string;
          template_id: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          board_id?: string;
          template_id?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: Relationships;
      };
      moodboards: {
        Row: {
          id: string;
          owner_id: string;
          query: string;
          titles: Json;
          tags: Json;
          colors: Json;
          selected: number;
          harmony: string;
          overrides: Json;
          inspo_ids: Json;
          is_public: boolean;
          slug: string;
          is_draft: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          owner_id: string;
          query?: string;
          titles?: Json;
          tags?: Json;
          colors?: Json;
          selected?: number;
          harmony?: string;
          overrides?: Json;
          inspo_ids?: Json;
          is_public?: boolean;
          slug: string;
          is_draft?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          query?: string;
          titles?: Json;
          tags?: Json;
          colors?: Json;
          selected?: number;
          harmony?: string;
          overrides?: Json;
          inspo_ids?: Json;
          is_public?: boolean;
          slug?: string;
          is_draft?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: Relationships;
      };
      follows: {
        Row: {
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: {
          follower_id?: string;
          following_id?: string;
          created_at?: string;
        };
        Relationships: Relationships;
      };
      user_settings: {
        Row: {
          user_id: string;
          grid: Json;
          last_used_board_id: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          grid?: Json;
          last_used_board_id?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          grid?: Json;
          last_used_board_id?: string | null;
          updated_at?: string;
        };
        Relationships: Relationships;
      };
      templates: {
        Row: {
          template_id: string;
          slug: string;
          category: string;
          industry: string;
          topic: string;
          name: string;
          display_title: string;
          data: Json;
          updated_at: string;
        };
        Insert: {
          template_id: string;
          slug: string;
          category?: string;
          industry?: string;
          topic?: string;
          name: string;
          display_title: string;
          data: Json;
          updated_at?: string;
        };
        Update: {
          template_id?: string;
          slug?: string;
          category?: string;
          industry?: string;
          topic?: string;
          name?: string;
          display_title?: string;
          data?: Json;
          updated_at?: string;
        };
        Relationships: Relationships;
      };
      template_details: {
        Row: {
          template_id: string;
          data: Json;
          updated_at: string;
        };
        Insert: {
          template_id: string;
          data: Json;
          updated_at?: string;
        };
        Update: {
          template_id?: string;
          data?: Json;
          updated_at?: string;
        };
        Relationships: Relationships;
      };
      llm_interpret_cache: {
        Row: {
          cache_key: string;
          result: Json;
          created_at: string;
        };
        Insert: {
          cache_key: string;
          result: Json;
          created_at?: string;
        };
        Update: {
          cache_key?: string;
          result?: Json;
          created_at?: string;
        };
        Relationships: Relationships;
      };
      llm_moodboard_titles_cache: {
        Row: {
          cache_key: string;
          titles: Json;
          created_at: string;
        };
        Insert: {
          cache_key: string;
          titles: Json;
          created_at?: string;
        };
        Update: {
          cache_key?: string;
          titles?: Json;
          created_at?: string;
        };
        Relationships: Relationships;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type BoardRow = Database["public"]["Tables"]["boards"]["Row"];
export type MoodboardRow = Database["public"]["Tables"]["moodboards"]["Row"];
