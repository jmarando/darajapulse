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
      brief_templates: {
        Row: {
          brief: string | null
          client_id: string
          content_format: string | null
          created_at: string
          created_by: string | null
          donts: string[] | null
          dos: string[] | null
          hashtag: string | null
          hashtags_extra: string[] | null
          id: string
          mandatory_mentions: string[] | null
          name: string
          objective: string | null
          references_urls: string[] | null
          tone: string | null
          updated_at: string
          wht_percent: number | null
        }
        Insert: {
          brief?: string | null
          client_id: string
          content_format?: string | null
          created_at?: string
          created_by?: string | null
          donts?: string[] | null
          dos?: string[] | null
          hashtag?: string | null
          hashtags_extra?: string[] | null
          id?: string
          mandatory_mentions?: string[] | null
          name: string
          objective?: string | null
          references_urls?: string[] | null
          tone?: string | null
          updated_at?: string
          wht_percent?: number | null
        }
        Update: {
          brief?: string | null
          client_id?: string
          content_format?: string | null
          created_at?: string
          created_by?: string | null
          donts?: string[] | null
          dos?: string[] | null
          hashtag?: string | null
          hashtags_extra?: string[] | null
          id?: string
          mandatory_mentions?: string[] | null
          name?: string
          objective?: string | null
          references_urls?: string[] | null
          tone?: string | null
          updated_at?: string
          wht_percent?: number | null
        }
        Relationships: []
      }
      campaign_influencers: {
        Row: {
          brief_token: string
          campaign_id: string
          created_at: string
          deliverables_breakdown: Json
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
          deliverables_breakdown?: Json
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
          deliverables_breakdown?: Json
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
      campaign_members: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_team_members: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          team_role: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          team_role?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          team_role?: string
          user_id?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          brief: string | null
          brief_template_id: string | null
          budget_kes: number | null
          client_id: string
          content_format: string | null
          created_at: string
          created_by: string | null
          donts: string[] | null
          dos: string[] | null
          end_date: string | null
          hashtag: string | null
          hashtags_extra: string[] | null
          id: string
          learnings: string | null
          mandatory_mentions: string[] | null
          name: string
          objective: string | null
          references_urls: string[] | null
          slug: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          tone: string | null
          wht_percent: number | null
        }
        Insert: {
          brief?: string | null
          brief_template_id?: string | null
          budget_kes?: number | null
          client_id: string
          content_format?: string | null
          created_at?: string
          created_by?: string | null
          donts?: string[] | null
          dos?: string[] | null
          end_date?: string | null
          hashtag?: string | null
          hashtags_extra?: string[] | null
          id?: string
          learnings?: string | null
          mandatory_mentions?: string[] | null
          name: string
          objective?: string | null
          references_urls?: string[] | null
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          tone?: string | null
          wht_percent?: number | null
        }
        Update: {
          brief?: string | null
          brief_template_id?: string | null
          budget_kes?: number | null
          client_id?: string
          content_format?: string | null
          created_at?: string
          created_by?: string | null
          donts?: string[] | null
          dos?: string[] | null
          end_date?: string | null
          hashtag?: string | null
          hashtags_extra?: string[] | null
          id?: string
          learnings?: string | null
          mandatory_mentions?: string[] | null
          name?: string
          objective?: string | null
          references_urls?: string[] | null
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          tone?: string | null
          wht_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brief_template_id_fkey"
            columns: ["brief_template_id"]
            isOneToOne: false
            referencedRelation: "brief_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_members: {
        Row: {
          client_id: string
          created_at: string
          id: string
          invited_email: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          invited_email?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          invited_email?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_team_members: {
        Row: {
          client_id: string
          created_at: string
          id: string
          team_role: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          team_role?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          team_role?: string
          user_id?: string
        }
        Relationships: []
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
      content_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          content_item_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          content_item_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          content_item_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_comments_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          asset_url: string | null
          campaign_id: string
          caption: string | null
          created_at: string
          created_by: string | null
          id: string
          influencer_id: string | null
          notes: string | null
          platform: Database["public"]["Enums"]["platform"]
          scheduled_for: string | null
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          asset_url?: string | null
          campaign_id: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          influencer_id?: string | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["platform"]
          scheduled_for?: string | null
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          asset_url?: string | null
          campaign_id?: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          influencer_id?: string | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["platform"]
          scheduled_for?: string | null
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_entries: {
        Row: {
          address: string | null
          caption: string | null
          comments: number | null
          contest_id: string
          created_at: string
          cross_posts: Json
          external_registration_id: string | null
          facebook_handle: string | null
          full_name: string | null
          handle: string | null
          id: string
          influencer_id: string | null
          instagram_handle: string | null
          last_polled_at: string | null
          lga: string | null
          likes: number | null
          metadata: Json
          phone: string | null
          platform: Database["public"]["Enums"]["platform"]
          post_url: string | null
          posted_at: string | null
          round_number: number | null
          saves: number | null
          score: number | null
          shares: number | null
          source: string
          status: string
          submitter_email: string | null
          submitter_name: string | null
          thumbnail_url: string | null
          tiktok_handle: string | null
          views: number | null
        }
        Insert: {
          address?: string | null
          caption?: string | null
          comments?: number | null
          contest_id: string
          created_at?: string
          cross_posts?: Json
          external_registration_id?: string | null
          facebook_handle?: string | null
          full_name?: string | null
          handle?: string | null
          id?: string
          influencer_id?: string | null
          instagram_handle?: string | null
          last_polled_at?: string | null
          lga?: string | null
          likes?: number | null
          metadata?: Json
          phone?: string | null
          platform: Database["public"]["Enums"]["platform"]
          post_url?: string | null
          posted_at?: string | null
          round_number?: number | null
          saves?: number | null
          score?: number | null
          shares?: number | null
          source?: string
          status?: string
          submitter_email?: string | null
          submitter_name?: string | null
          thumbnail_url?: string | null
          tiktok_handle?: string | null
          views?: number | null
        }
        Update: {
          address?: string | null
          caption?: string | null
          comments?: number | null
          contest_id?: string
          created_at?: string
          cross_posts?: Json
          external_registration_id?: string | null
          facebook_handle?: string | null
          full_name?: string | null
          handle?: string | null
          id?: string
          influencer_id?: string | null
          instagram_handle?: string | null
          last_polled_at?: string | null
          lga?: string | null
          likes?: number | null
          metadata?: Json
          phone?: string | null
          platform?: Database["public"]["Enums"]["platform"]
          post_url?: string | null
          posted_at?: string | null
          round_number?: number | null
          saves?: number | null
          score?: number | null
          shares?: number | null
          source?: string
          status?: string
          submitter_email?: string | null
          submitter_name?: string | null
          thumbnail_url?: string | null
          tiktok_handle?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contest_entries_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_entries_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
        ]
      }
      contestant_sync_runs: {
        Row: {
          contest_id: string | null
          errors: Json
          fetched: number
          finished_at: string | null
          id: string
          source: string
          started_at: string
          status: string
          triggered_by: string
          upserted: number
        }
        Insert: {
          contest_id?: string | null
          errors?: Json
          fetched?: number
          finished_at?: string | null
          id?: string
          source?: string
          started_at?: string
          status?: string
          triggered_by?: string
          upserted?: number
        }
        Update: {
          contest_id?: string | null
          errors?: Json
          fetched?: number
          finished_at?: string | null
          id?: string
          source?: string
          started_at?: string
          status?: string
          triggered_by?: string
          upserted?: number
        }
        Relationships: []
      }
      contests: {
        Row: {
          campaign_id: string
          created_at: string
          end_date: string
          formula: string
          hashtag: string
          id: string
          is_active: boolean
          name: string
          platforms: string[]
          prize: string | null
          round_days: number
          start_date: string
          submission_token: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          end_date: string
          formula?: string
          hashtag: string
          id?: string
          is_active?: boolean
          name: string
          platforms?: string[]
          prize?: string | null
          round_days?: number
          start_date: string
          submission_token?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          end_date?: string
          formula?: string
          hashtag?: string
          id?: string
          is_active?: boolean
          name?: string
          platforms?: string[]
          prize?: string | null
          round_days?: number
          start_date?: string
          submission_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "contests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          created_at: string
          details: string | null
          email: string
          id: string
          platform_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          email: string
          id?: string
          platform_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          email?: string
          id?: string
          platform_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      facebook_accounts: {
        Row: {
          category: string | null
          created_at: string
          id: string
          influencer_id: string
          page_access_token: string
          page_id: string
          page_name: string | null
          page_username: string | null
          picture_url: string | null
          scope: string | null
          token_expires_at: string | null
          updated_at: string
          user_access_token: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          influencer_id: string
          page_access_token: string
          page_id: string
          page_name?: string | null
          page_username?: string | null
          picture_url?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_access_token?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          influencer_id?: string
          page_access_token?: string
          page_id?: string
          page_name?: string | null
          page_username?: string | null
          picture_url?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_access_token?: string | null
        }
        Relationships: []
      }
      facebook_oauth_states: {
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
      influencers: {
        Row: {
          audience_age_breakdown: Json | null
          audience_gender_breakdown: Json | null
          audience_kenya_pct: number | null
          audience_top_cities: Json | null
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
          audience_age_breakdown?: Json | null
          audience_gender_breakdown?: Json | null
          audience_kenya_pct?: number | null
          audience_top_cities?: Json | null
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
          audience_age_breakdown?: Json | null
          audience_gender_breakdown?: Json | null
          audience_kenya_pct?: number | null
          audience_top_cities?: Json | null
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
      instagram_accounts: {
        Row: {
          created_at: string
          id: string
          ig_user_id: string
          influencer_id: string
          name: string | null
          page_access_token: string
          page_id: string | null
          profile_picture_url: string | null
          scope: string | null
          token_expires_at: string | null
          updated_at: string
          user_access_token: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ig_user_id: string
          influencer_id: string
          name?: string | null
          page_access_token: string
          page_id?: string | null
          profile_picture_url?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_access_token?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ig_user_id?: string
          influencer_id?: string
          name?: string | null
          page_access_token?: string
          page_id?: string | null
          profile_picture_url?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_access_token?: string | null
          username?: string | null
        }
        Relationships: []
      }
      instagram_oauth_states: {
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
      plan_links: {
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
            foreignKeyName: "plan_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
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
          title: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          title?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          title?: string | null
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
      report_recipients: {
        Row: {
          audience: string
          campaign_id: string
          created_at: string
          email: string
          id: string
          name: string | null
          receives_campaign_weekly: boolean
          receives_contest_daily: boolean
          receives_draw_closed: boolean
        }
        Insert: {
          audience: string
          campaign_id: string
          created_at?: string
          email: string
          id?: string
          name?: string | null
          receives_campaign_weekly?: boolean
          receives_contest_daily?: boolean
          receives_draw_closed?: boolean
        }
        Update: {
          audience?: string
          campaign_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          receives_campaign_weekly?: boolean
          receives_contest_daily?: boolean
          receives_draw_closed?: boolean
        }
        Relationships: []
      }
      report_schedules: {
        Row: {
          campaign_id: string
          contest_id: string | null
          created_at: string
          enabled: boolean
          id: string
          last_sent_at: string | null
          report_type: string
          send_dow: number | null
          send_hour: number
          send_minute: number
          timezone: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          contest_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          report_type: string
          send_dow?: number | null
          send_hour?: number
          send_minute?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          contest_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          report_type?: string
          send_dow?: number | null
          send_hour?: number
          send_minute?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_agency_team: {
        Args: never
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
        }[]
      }
      get_brief_by_token: { Args: { _token: string }; Returns: Json }
      get_contest_by_token: { Args: { _token: string }; Returns: Json }
      get_profiles_by_ids: {
        Args: { _ids: string[] }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      run_contest_auto_polling: { Args: never; Returns: undefined }
      slugify: { Args: { _s: string }; Returns: string }
      submit_contest_entry: {
        Args: {
          _handle: string
          _platform: string
          _post_url: string
          _submitter_email: string
          _submitter_name: string
          _token: string
        }
        Returns: string
      }
      update_brief_status: {
        Args: { _status: string; _token: string }
        Returns: undefined
      }
      user_has_campaign_access: {
        Args: { _campaign_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_client_access: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "agency_admin"
        | "account_manager"
        | "client_viewer"
        | "influencer"
        | "client_user"
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
        "client_user",
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
