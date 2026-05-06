export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      approvals: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          post_id: string
          reviewer_id: string | null
          round: number | null
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          post_id: string
          reviewer_id?: string | null
          round?: number | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          post_id?: string
          reviewer_id?: string | null
          round?: number | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "approvals_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_influencers: {
        Row: {
          brief_token: string
          campaign_id: string
          created_at: string
          deliverables_count: number | null
          fee_kes: number | null
          id: string
          influencer_id: string
          status: string | null
        }
        Insert: {
          brief_token?: string
          campaign_id: string
          created_at?: string
          deliverables_count?: number | null
          fee_kes?: number | null
          id?: string
          influencer_id: string
          status?: string | null
        }
        Update: {
          brief_token?: string
          campaign_id?: string
          created_at?: string
          deliverables_count?: number | null
          fee_kes?: number | null
          id?: string
          influencer_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_influencers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_influencers_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          brief: string | null
          budget_kes: number | null
          client_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          hashtag: string | null
          id: string
          name: string
          objective: string | null
          slug: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
        }
        Insert: {
          brief?: string | null
          budget_kes?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          hashtag?: string | null
          id?: string
          name: string
          objective?: string | null
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
        }
        Update: {
          brief?: string | null
          budget_kes?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          hashtag?: string | null
          id?: string
          name?: string
          objective?: string | null
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          primary_contact_email: string | null
          primary_contact_name: string | null
          slug: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          slug?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      influencers: {
        Row: {
          audience_kenya_pct: number | null
          authenticity_score: number | null
          avatar_url: string | null
          avg_cpm_kes: number | null
          created_at: string
          email: string | null
          engagement_rate: number | null
          follower_count: number | null
          full_name: string
          handle: string | null
          id: string
          languages: string[] | null
          niche: string | null
          notes: string | null
          phone_mpesa: string | null
          primary_platform: Database["public"]["Enums"]["platform"] | null
          region: string | null
        }
        Insert: {
          audience_kenya_pct?: number | null
          authenticity_score?: number | null
          avatar_url?: string | null
          avg_cpm_kes?: number | null
          created_at?: string
          email?: string | null
          engagement_rate?: number | null
          follower_count?: number | null
          full_name: string
          handle?: string | null
          id?: string
          languages?: string[] | null
          niche?: string | null
          notes?: string | null
          phone_mpesa?: string | null
          primary_platform?: Database["public"]["Enums"]["platform"] | null
          region?: string | null
        }
        Update: {
          audience_kenya_pct?: number | null
          authenticity_score?: number | null
          avatar_url?: string | null
          avg_cpm_kes?: number | null
          created_at?: string
          email?: string | null
          engagement_rate?: number | null
          follower_count?: number | null
          full_name?: string
          handle?: string | null
          id?: string
          languages?: string[] | null
          niche?: string | null
          notes?: string | null
          phone_mpesa?: string | null
          primary_platform?: Database["public"]["Enums"]["platform"] | null
          region?: string | null
        }
        Relationships: []
      }
      payouts: {
        Row: {
          campaign_id: string
          created_at: string
          gross_kes: number
          id: string
          influencer_id: string
          mpesa_ref: string | null
          net_kes: number
          paid_at: string | null
          status: Database["public"]["Enums"]["payout_status"]
          wht_kes: number | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          gross_kes: number
          id?: string
          influencer_id: string
          mpesa_ref?: string | null
          net_kes: number
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          wht_kes?: number | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          gross_kes?: number
          id?: string
          influencer_id?: string
          mpesa_ref?: string | null
          net_kes?: number
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          wht_kes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metrics: {
        Row: {
          captured_at: string
          comments: number | null
          id: string
          impressions: number | null
          likes: number | null
          post_id: string
          reach: number | null
          saves: number | null
          shares: number | null
          views: number | null
        }
        Insert: {
          captured_at?: string
          comments?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          post_id: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          views?: number | null
        }
        Update: {
          captured_at?: string
          comments?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          post_id?: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          campaign_id: string
          caption: string | null
          created_at: string
          id: string
          influencer_id: string
          platform: Database["public"]["Enums"]["platform"]
          post_url: string | null
          posted_at: string | null
          status: Database["public"]["Enums"]["post_status"]
          thumbnail_url: string | null
          tiktok_video_id: string | null
        }
        Insert: {
          campaign_id: string
          caption?: string | null
          created_at?: string
          id?: string
          influencer_id: string
          platform?: Database["public"]["Enums"]["platform"]
          post_url?: string | null
          posted_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          thumbnail_url?: string | null
          tiktok_video_id?: string | null
        }
        Update: {
          campaign_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          influencer_id?: string
          platform?: Database["public"]["Enums"]["platform"]
          post_url?: string | null
          posted_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          thumbnail_url?: string | null
          tiktok_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      report_links: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          is_active: boolean
          token: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          token?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_accounts: {
        Row: {
          access_token: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          expires_at: string
          id: string
          influencer_id: string
          open_id: string
          refresh_expires_at: string | null
          refresh_token: string
          scope: string | null
          union_id: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          expires_at: string
          id?: string
          influencer_id: string
          open_id: string
          refresh_expires_at?: string | null
          refresh_token: string
          scope?: string | null
          union_id?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string
          id?: string
          influencer_id?: string
          open_id?: string
          refresh_expires_at?: string | null
          refresh_token?: string
          scope?: string | null
          union_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tiktok_oauth_states: {
        Row: {
          created_at: string
          influencer_id: string
          state: string
        }
        Insert: {
          created_at?: string
          influencer_id: string
          state: string
        }
        Update: {
          created_at?: string
          influencer_id?: string
          state?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_brief_by_token: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      slugify: { Args: { _s: string }; Returns: string }
      update_brief_status: {
        Args: { _status: string; _token: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "agency_admin"
        | "account_manager"
        | "client_viewer"
        | "influencer"
      approval_status: "pending" | "approved" | "changes_requested"
      campaign_status:
        | "draft"
        | "pitched"
        | "won"
        | "live"
        | "reporting"
        | "closed"
      payout_status: "pending" | "processing" | "paid" | "failed"
      platform: "tiktok" | "instagram" | "youtube" | "twitter" | "facebook"
      post_status: "drafted" | "approved" | "live" | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "agency_admin",
        "account_manager",
        "client_viewer",
        "influencer",
      ],
      approval_status: ["pending", "approved", "changes_requested"],
      campaign_status: [
        "draft",
        "pitched",
        "won",
        "live",
        "reporting",
        "closed",
      ],
      payout_status: ["pending", "processing", "paid", "failed"],
      platform: ["tiktok", "instagram", "youtube", "twitter", "facebook"],
      post_status: ["drafted", "approved", "live", "completed"],
    },
  },
} as const
