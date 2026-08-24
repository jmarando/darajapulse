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
      agencies: {
        Row: {
          billing_cycle: string
          billing_notes: string | null
          created_at: string
          display_name: string | null
          hide_powered_by: boolean
          id: string
          invoice_address: string | null
          is_active: boolean
          is_default: boolean
          is_suspended: boolean
          kind: Database["public"]["Enums"]["agency_kind"]
          kra_pin: string | null
          legal_name: string | null
          logo_url: string | null
          max_seats: number
          monthly_fee_kes: number
          name: string
          primary_color: string | null
          slug: string
          subdomain: string | null
          support_email: string | null
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          billing_notes?: string | null
          created_at?: string
          display_name?: string | null
          hide_powered_by?: boolean
          id?: string
          invoice_address?: string | null
          is_active?: boolean
          is_default?: boolean
          is_suspended?: boolean
          kind?: Database["public"]["Enums"]["agency_kind"]
          kra_pin?: string | null
          legal_name?: string | null
          logo_url?: string | null
          max_seats?: number
          monthly_fee_kes?: number
          name: string
          primary_color?: string | null
          slug: string
          subdomain?: string | null
          support_email?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          billing_notes?: string | null
          created_at?: string
          display_name?: string | null
          hide_powered_by?: boolean
          id?: string
          invoice_address?: string | null
          is_active?: boolean
          is_default?: boolean
          is_suspended?: boolean
          kind?: Database["public"]["Enums"]["agency_kind"]
          kra_pin?: string | null
          legal_name?: string | null
          logo_url?: string | null
          max_seats?: number
          monthly_fee_kes?: number
          name?: string
          primary_color?: string | null
          slug?: string
          subdomain?: string | null
          support_email?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
      billing_contacts: {
        Row: {
          created_at: string
          email: string
          id: string
          is_primary: boolean
          name: string | null
          org_id: string
          org_kind: string
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean
          name?: string | null
          org_id: string
          org_kind: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          name?: string | null
          org_id?: string
          org_kind?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      brand_org_agencies: {
        Row: {
          agency_id: string
          brand_org_id: string
          created_at: string
          id: string
          status: string
        }
        Insert: {
          agency_id: string
          brand_org_id: string
          created_at?: string
          id?: string
          status?: string
        }
        Update: {
          agency_id?: string
          brand_org_id?: string
          created_at?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_org_agencies_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_org_agencies_brand_org_id_fkey"
            columns: ["brand_org_id"]
            isOneToOne: false
            referencedRelation: "brand_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_orgs: {
        Row: {
          billing_cycle: string
          billing_notes: string | null
          created_at: string
          display_name: string | null
          id: string
          invoice_address: string | null
          is_active: boolean
          is_suspended: boolean
          kra_pin: string | null
          legal_name: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          slug: string
          subdomain: string | null
          subscription_fee_kes: number
          support_email: string | null
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          billing_notes?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          invoice_address?: string | null
          is_active?: boolean
          is_suspended?: boolean
          kra_pin?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          slug: string
          subdomain?: string | null
          subscription_fee_kes?: number
          support_email?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          billing_notes?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          invoice_address?: string | null
          is_active?: boolean
          is_suspended?: boolean
          kra_pin?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          slug?: string
          subdomain?: string | null
          subscription_fee_kes?: number
          support_email?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      brief_templates: {
        Row: {
          agency_id: string | null
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
          source_file_name: string | null
          source_file_url: string | null
          tone: string | null
          updated_at: string
          wht_percent: number | null
        }
        Insert: {
          agency_id?: string | null
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
          source_file_name?: string | null
          source_file_url?: string | null
          tone?: string | null
          updated_at?: string
          wht_percent?: number | null
        }
        Update: {
          agency_id?: string | null
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
          source_file_name?: string | null
          source_file_url?: string | null
          tone?: string | null
          updated_at?: string
          wht_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brief_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
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
          agency_id: string
          brief: string | null
          brief_template_id: string | null
          budget_kes: number | null
          client_id: string
          content_format: string | null
          contract_template_id: string | null
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
          require_draft_approval: boolean
          slug: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          tone: string | null
          wht_percent: number | null
        }
        Insert: {
          agency_id: string
          brief?: string | null
          brief_template_id?: string | null
          budget_kes?: number | null
          client_id: string
          content_format?: string | null
          contract_template_id?: string | null
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
          require_draft_approval?: boolean
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          tone?: string | null
          wht_percent?: number | null
        }
        Update: {
          agency_id?: string
          brief?: string | null
          brief_template_id?: string | null
          budget_kes?: number | null
          client_id?: string
          content_format?: string | null
          contract_template_id?: string | null
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
          require_draft_approval?: boolean
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          tone?: string | null
          wht_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "campaigns_contract_template_id_fkey"
            columns: ["contract_template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
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
          agency_id: string
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
          agency_id: string
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
          agency_id?: string
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
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
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
      contest_excluded_handles: {
        Row: {
          contest_id: string
          created_at: string
          handle: string
          id: string
          reason: string | null
        }
        Insert: {
          contest_id: string
          created_at?: string
          handle: string
          id?: string
          reason?: string | null
        }
        Update: {
          contest_id?: string
          created_at?: string
          handle?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      contest_winners: {
        Row: {
          contest_id: string
          created_at: string
          entry_id: string | null
          frozen_score: number | null
          full_name: string | null
          handle: string | null
          id: string
          placement: string
          placement_rank: number
          platform: string | null
          post_url: string | null
          prize: string | null
          round_number: number
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          contest_id: string
          created_at?: string
          entry_id?: string | null
          frozen_score?: number | null
          full_name?: string | null
          handle?: string | null
          id?: string
          placement: string
          placement_rank: number
          platform?: string | null
          post_url?: string | null
          prize?: string | null
          round_number: number
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          contest_id?: string
          created_at?: string
          entry_id?: string | null
          frozen_score?: number | null
          full_name?: string | null
          handle?: string | null
          id?: string
          placement?: string
          placement_rank?: number
          platform?: string | null
          post_url?: string | null
          prize?: string | null
          round_number?: number
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_winners_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "contest_entries"
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
          agency_id: string
          campaign_id: string | null
          client_id: string | null
          created_at: string
          end_date: string
          formula: string
          hashtag: string
          id: string
          is_active: boolean
          manual_round_cutoffs: string[]
          name: string
          platforms: string[]
          prize: string | null
          round_days: number
          start_date: string
          submission_token: string
        }
        Insert: {
          agency_id: string
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string
          end_date: string
          formula?: string
          hashtag: string
          id?: string
          is_active?: boolean
          manual_round_cutoffs?: string[]
          name: string
          platforms?: string[]
          prize?: string | null
          round_days?: number
          start_date: string
          submission_token?: string
        }
        Update: {
          agency_id?: string
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string
          end_date?: string
          formula?: string
          hashtag?: string
          id?: string
          is_active?: boolean
          manual_round_cutoffs?: string[]
          name?: string
          platforms?: string[]
          prize?: string | null
          round_days?: number
          start_date?: string
          submission_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "contests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          campaign_id: string
          campaign_influencer_id: string
          contract_hash: string
          contract_text: string
          created_at: string
          id: string
          influencer_id: string
          ip_address: string | null
          signature_data_url: string | null
          signed_at: string
          signer_name: string
          template_id: string | null
          user_agent: string | null
        }
        Insert: {
          campaign_id: string
          campaign_influencer_id: string
          contract_hash: string
          contract_text: string
          created_at?: string
          id?: string
          influencer_id: string
          ip_address?: string | null
          signature_data_url?: string | null
          signed_at?: string
          signer_name: string
          template_id?: string | null
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string
          campaign_influencer_id?: string
          contract_hash?: string
          contract_text?: string
          created_at?: string
          id?: string
          influencer_id?: string
          ip_address?: string | null
          signature_data_url?: string | null
          signed_at?: string
          signer_name?: string
          template_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_campaign_influencer_id_fkey"
            columns: ["campaign_influencer_id"]
            isOneToOne: true
            referencedRelation: "campaign_influencers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          agency_id: string | null
          body: string
          campaign_id: string | null
          created_at: string
          created_by: string | null
          exclusivity: string | null
          governing_law: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          body: string
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          exclusivity?: string | null
          governing_law?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          body?: string
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          exclusivity?: string | null
          governing_law?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_templates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_drafts: {
        Row: {
          campaign_id: string
          campaign_influencer_id: string | null
          caption: string | null
          created_at: string
          creator_note: string | null
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          influencer_id: string | null
          mime_type: string | null
          platform: string | null
          post_url: string | null
          posted_entry_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_label: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          campaign_influencer_id?: string | null
          caption?: string | null
          created_at?: string
          creator_note?: string | null
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          influencer_id?: string | null
          mime_type?: string | null
          platform?: string | null
          post_url?: string | null
          posted_entry_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_label?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          campaign_influencer_id?: string | null
          caption?: string | null
          created_at?: string
          creator_note?: string | null
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          influencer_id?: string | null
          mime_type?: string | null
          platform?: string | null
          post_url?: string | null
          posted_entry_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_label?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_drafts_campaign_influencer_id_fkey"
            columns: ["campaign_influencer_id"]
            isOneToOne: false
            referencedRelation: "campaign_influencers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_drafts_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
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
      demo_requests: {
        Row: {
          company: string | null
          created_at: string
          email: string
          email_status: string | null
          id: string
          message: string | null
          name: string
          role: string | null
          source: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          email_status?: string | null
          id?: string
          message?: string | null
          name: string
          role?: string | null
          source?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          email_status?: string | null
          id?: string
          message?: string | null
          name?: string
          role?: string | null
          source?: string | null
        }
        Relationships: []
      }
      discovery_contacts: {
        Row: {
          added_by: string | null
          created_at: string
          creator_id: string
          id: string
          is_public: boolean
          kind: string
          label: string | null
          value: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          creator_id: string
          id?: string
          is_public?: boolean
          kind: string
          label?: string | null
          value: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          creator_id?: string
          id?: string
          is_public?: boolean
          kind?: string
          label?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_contacts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "discovery_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_creators: {
        Row: {
          ai_confidence: number | null
          audience_demo: Json | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          demo_source: string | null
          engagement_rate: number | null
          follower_count: number | null
          full_name: string
          handle: string
          id: string
          niche: string[] | null
          notes: string | null
          platform: string
          profile_url: string | null
          region: string | null
          shows: string[] | null
          source: string
          updated_at: string
          verified_at: string | null
          works_for: string[] | null
        }
        Insert: {
          ai_confidence?: number | null
          audience_demo?: Json | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          demo_source?: string | null
          engagement_rate?: number | null
          follower_count?: number | null
          full_name: string
          handle: string
          id?: string
          niche?: string[] | null
          notes?: string | null
          platform: string
          profile_url?: string | null
          region?: string | null
          shows?: string[] | null
          source?: string
          updated_at?: string
          verified_at?: string | null
          works_for?: string[] | null
        }
        Update: {
          ai_confidence?: number | null
          audience_demo?: Json | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          demo_source?: string | null
          engagement_rate?: number | null
          follower_count?: number | null
          full_name?: string
          handle?: string
          id?: string
          niche?: string[] | null
          notes?: string | null
          platform?: string
          profile_url?: string | null
          region?: string | null
          shows?: string[] | null
          source?: string
          updated_at?: string
          verified_at?: string | null
          works_for?: string[] | null
        }
        Relationships: []
      }
      discovery_searches: {
        Row: {
          brief: Json
          created_at: string
          id: string
          results: Json
          user_id: string | null
        }
        Insert: {
          brief: Json
          created_at?: string
          id?: string
          results?: Json
          user_id?: string | null
        }
        Update: {
          brief?: Json
          created_at?: string
          id?: string
          results?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      draft_links: {
        Row: {
          campaign_id: string
          can_decide: boolean
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          token: string
        }
        Insert: {
          campaign_id: string
          can_decide?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          token?: string
        }
        Update: {
          campaign_id?: string
          can_decide?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_mailboxes: {
        Row: {
          address: string
          agency_id: string | null
          campaign_id: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string | null
        }
        Insert: {
          address: string
          agency_id?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
        }
        Update: {
          address?: string
          agency_id?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_mailboxes_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_mailboxes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          attachments: Json
          cc_emails: string[]
          created_at: string
          direction: string
          from_email: string
          from_name: string | null
          html_body: string | null
          id: string
          in_reply_to: string | null
          message_id: string | null
          provider_id: string | null
          sent_by: string | null
          subject: string | null
          text_body: string | null
          thread_id: string
          to_emails: string[]
        }
        Insert: {
          attachments?: Json
          cc_emails?: string[]
          created_at?: string
          direction: string
          from_email: string
          from_name?: string | null
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          provider_id?: string | null
          sent_by?: string | null
          subject?: string | null
          text_body?: string | null
          thread_id: string
          to_emails?: string[]
        }
        Update: {
          attachments?: Json
          cc_emails?: string[]
          created_at?: string
          direction?: string
          from_email?: string
          from_name?: string | null
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          provider_id?: string | null
          sent_by?: string | null
          subject?: string | null
          text_body?: string | null
          thread_id?: string
          to_emails?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
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
      email_threads: {
        Row: {
          agency_id: string | null
          campaign_id: string | null
          created_at: string
          id: string
          influencer_id: string | null
          last_message_at: string
          last_snippet: string | null
          mailbox: string
          participant_email: string
          participant_name: string | null
          status: string
          subject: string | null
          unread_count: number
        }
        Insert: {
          agency_id?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          influencer_id?: string | null
          last_message_at?: string
          last_snippet?: string | null
          mailbox: string
          participant_email: string
          participant_name?: string | null
          status?: string
          subject?: string | null
          unread_count?: number
        }
        Update: {
          agency_id?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          influencer_id?: string | null
          last_message_at?: string
          last_snippet?: string | null
          mailbox?: string
          participant_email?: string
          participant_name?: string | null
          status?: string
          subject?: string | null
          unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
        ]
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
          agency_id: string
          alt_handles: string[]
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
          last_metrics_sync: string | null
          niche: string | null
          notes: string | null
          phone_mpesa: string | null
          primary_platform: Database["public"]["Enums"]["platform"] | null
          referral_code: string | null
          referral_currency: string
          referral_deposits_amount: number
          referral_deposits_count: number
          referral_registrations: number
          referral_updated_at: string | null
          referral_url: string | null
          region: string | null
        }
        Insert: {
          agency_id: string
          alt_handles?: string[]
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
          last_metrics_sync?: string | null
          niche?: string | null
          notes?: string | null
          phone_mpesa?: string | null
          primary_platform?: Database["public"]["Enums"]["platform"] | null
          referral_code?: string | null
          referral_currency?: string
          referral_deposits_amount?: number
          referral_deposits_count?: number
          referral_registrations?: number
          referral_updated_at?: string | null
          referral_url?: string | null
          region?: string | null
        }
        Update: {
          agency_id?: string
          alt_handles?: string[]
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
          last_metrics_sync?: string | null
          niche?: string | null
          notes?: string | null
          phone_mpesa?: string | null
          primary_platform?: Database["public"]["Enums"]["platform"] | null
          referral_code?: string | null
          referral_currency?: string
          referral_deposits_amount?: number
          referral_deposits_count?: number
          referral_registrations?: number
          referral_updated_at?: string | null
          referral_url?: string | null
          region?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "influencers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
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
      inventory_bookings: {
        Row: {
          agency_id: string
          budget_kes: number | null
          company: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          id: string
          internal_notes: string | null
          inventory_item_id: string | null
          items: Json
          message: string | null
          status: Database["public"]["Enums"]["booking_status"]
          target_end: string | null
          target_start: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          budget_kes?: number | null
          company?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          internal_notes?: string | null
          inventory_item_id?: string | null
          items?: Json
          message?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          target_end?: string | null
          target_start?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          budget_kes?: number | null
          company?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          internal_notes?: string | null
          inventory_item_id?: string | null
          items?: Json
          message?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          target_end?: string | null
          target_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_bookings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_bookings_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          agency_id: string
          audience_demo: Json | null
          base_rate_kes: number | null
          cover_url: string | null
          created_at: string
          deliverable_type: string | null
          demo_source: string | null
          description: string | null
          engagement_rate: number | null
          follower_count: number | null
          handle: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["inventory_kind"]
          platform: string | null
          revisions: number | null
          sort_order: number
          subtitle: string | null
          tags: string[] | null
          title: string
          turnaround_days: number | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          audience_demo?: Json | null
          base_rate_kes?: number | null
          cover_url?: string | null
          created_at?: string
          deliverable_type?: string | null
          demo_source?: string | null
          description?: string | null
          engagement_rate?: number | null
          follower_count?: number | null
          handle?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["inventory_kind"]
          platform?: string | null
          revisions?: number | null
          sort_order?: number
          subtitle?: string | null
          tags?: string[] | null
          title: string
          turnaround_days?: number | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          audience_demo?: Json | null
          base_rate_kes?: number | null
          cover_url?: string | null
          created_at?: string
          deliverable_type?: string | null
          demo_source?: string | null
          description?: string | null
          engagement_rate?: number | null
          follower_count?: number | null
          handle?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["inventory_kind"]
          platform?: string | null
          revisions?: number | null
          sort_order?: number
          subtitle?: string | null
          tags?: string[] | null
          title?: string
          turnaround_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_kes: number
          billing_email: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          org_id: string
          org_kind: string
          paid_at: string | null
          period_end: string
          period_start: string
          pesapal_merchant_reference: string | null
          pesapal_order_tracking_id: string | null
          pesapal_redirect_url: string | null
          sent_at: string | null
          status: string
          updated_at: string
          view_token: string | null
        }
        Insert: {
          amount_kes: number
          billing_email?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          org_id: string
          org_kind: string
          paid_at?: string | null
          period_end: string
          period_start: string
          pesapal_merchant_reference?: string | null
          pesapal_order_tracking_id?: string | null
          pesapal_redirect_url?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          view_token?: string | null
        }
        Update: {
          amount_kes?: number
          billing_email?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          org_id?: string
          org_kind?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          pesapal_merchant_reference?: string | null
          pesapal_order_tracking_id?: string | null
          pesapal_redirect_url?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          view_token?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_kes: number
          created_at: string
          id: string
          invoice_id: string | null
          method: string
          notes: string | null
          org_id: string
          org_kind: string
          paid_at: string
          pesapal_confirmation_code: string | null
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount_kes: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          method: string
          notes?: string | null
          org_id: string
          org_kind: string
          paid_at?: string
          pesapal_confirmation_code?: string | null
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount_kes?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          method?: string
          notes?: string | null
          org_id?: string
          org_kind?: string
          paid_at?: string
          pesapal_confirmation_code?: string | null
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
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
      pesapal_ipn_log: {
        Row: {
          id: string
          merchant_reference: string | null
          notification_type: string | null
          order_tracking_id: string | null
          raw: Json | null
          received_at: string
          status_response: Json | null
        }
        Insert: {
          id?: string
          merchant_reference?: string | null
          notification_type?: string | null
          order_tracking_id?: string | null
          raw?: Json | null
          received_at?: string
          status_response?: Json | null
        }
        Update: {
          id?: string
          merchant_reference?: string | null
          notification_type?: string | null
          order_tracking_id?: string | null
          raw?: Json | null
          received_at?: string
          status_response?: Json | null
        }
        Relationships: []
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
          campaign_id: string | null
          contest_id: string | null
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
          campaign_id?: string | null
          contest_id?: string | null
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
          campaign_id?: string | null
          contest_id?: string | null
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
      show_contacts: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          kind: string
          label: string | null
          show_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          kind: string
          label?: string | null
          show_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          kind?: string
          label?: string | null
          show_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_contacts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      shows: {
        Row: {
          agency_id: string | null
          ai_confidence: number | null
          airtime: string | null
          city: string | null
          created_at: string
          days_on_air: string[] | null
          demographics: Json | null
          description: string | null
          handles: Json | null
          host_creator_ids: string[] | null
          host_names: string[] | null
          id: string
          kind: string
          logo_url: string | null
          name: string
          niche: string[] | null
          notes: string | null
          platforms: string[] | null
          reach_estimate: number | null
          region: string | null
          slug: string | null
          source: string | null
          station: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          agency_id?: string | null
          ai_confidence?: number | null
          airtime?: string | null
          city?: string | null
          created_at?: string
          days_on_air?: string[] | null
          demographics?: Json | null
          description?: string | null
          handles?: Json | null
          host_creator_ids?: string[] | null
          host_names?: string[] | null
          id?: string
          kind?: string
          logo_url?: string | null
          name: string
          niche?: string[] | null
          notes?: string | null
          platforms?: string[] | null
          reach_estimate?: number | null
          region?: string | null
          slug?: string | null
          source?: string | null
          station?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          agency_id?: string | null
          ai_confidence?: number | null
          airtime?: string | null
          city?: string | null
          created_at?: string
          days_on_air?: string[] | null
          demographics?: Json | null
          description?: string | null
          handles?: Json | null
          host_creator_ids?: string[] | null
          host_names?: string[] | null
          id?: string
          kind?: string
          logo_url?: string | null
          name?: string
          niche?: string[] | null
          notes?: string | null
          platforms?: string[] | null
          reach_estimate?: number | null
          region?: string | null
          slug?: string | null
          source?: string | null
          station?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shows_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          campaign_id: string
          caption: string | null
          created_at: string
          created_by: string | null
          exits: number | null
          expires_at: string | null
          external_id: string | null
          id: string
          impressions: number | null
          influencer_id: string
          link_clicks: number | null
          media_url: string | null
          notes: string | null
          permalink: string | null
          platform: Database["public"]["Enums"]["platform"]
          posted_at: string
          reach: number | null
          replies: number | null
          source: string
          taps_back: number | null
          taps_forward: number | null
          updated_at: string
          verified: boolean
        }
        Insert: {
          campaign_id: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          exits?: number | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          impressions?: number | null
          influencer_id: string
          link_clicks?: number | null
          media_url?: string | null
          notes?: string | null
          permalink?: string | null
          platform?: Database["public"]["Enums"]["platform"]
          posted_at?: string
          reach?: number | null
          replies?: number | null
          source?: string
          taps_back?: number | null
          taps_forward?: number | null
          updated_at?: string
          verified?: boolean
        }
        Update: {
          campaign_id?: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          exits?: number | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          impressions?: number | null
          influencer_id?: string
          link_clicks?: number | null
          media_url?: string | null
          notes?: string | null
          permalink?: string | null
          platform?: Database["public"]["Enums"]["platform"]
          posted_at?: string
          reach?: number | null
          replies?: number | null
          source?: string
          taps_back?: number | null
          taps_forward?: number | null
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "stories_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
        ]
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
          agency_id: string | null
          brand_org_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          agency_id?: string | null
          brand_org_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          agency_id?: string | null
          brand_org_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_brand_org_id_fkey"
            columns: ["brand_org_id"]
            isOneToOne: false
            referencedRelation: "brand_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agency_staff_on_campaign: {
        Args: { _campaign_id: string; _user_id: string }
        Returns: boolean
      }
      agency_staff_on_contest: {
        Args: { _contest_id: string; _user_id: string }
        Returns: boolean
      }
      agency_staff_on_post: {
        Args: { _post_id: string; _user_id: string }
        Returns: boolean
      }
      campaign_has_active_plan_link: {
        Args: { _campaign_id: string }
        Returns: boolean
      }
      campaign_has_active_report_link: {
        Args: { _campaign_id: string }
        Returns: boolean
      }
      campaign_perf_summary: {
        Args: { campaign_ids: string[] }
        Returns: {
          campaign_id: string
          engagement: number
          posts: number
          views: number
        }[]
      }
      campaign_post_peak_metrics: {
        Args: { target_campaign_id: string }
        Returns: {
          captured_at: string
          comments: number
          impressions: number
          likes: number
          post_id: string
          reach: number
          saves: number
          shares: number
          views: number
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enforce_billing_status: { Args: never; Returns: undefined }
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
      get_contest_entries_by_token: {
        Args: { _limit?: number; _offset?: number; _token: string }
        Returns: {
          caption: string
          comments: number
          contest_id: string
          created_at: string
          cross_posts: Json
          facebook_handle: string
          full_name: string
          handle: string
          id: string
          instagram_handle: string
          likes: number
          metadata: Json
          platform: string
          post_url: string
          posted_at: string
          round_number: number
          saves: number
          score: number
          shares: number
          source: string
          status: string
          submitter_name: string
          thumbnail_url: string
          tiktok_handle: string
          views: number
        }[]
      }
      get_contest_filter_handles: {
        Args: { _token: string }
        Returns: {
          handle: string
        }[]
      }
      get_contract_by_token: { Args: { _token: string }; Returns: Json }
      get_creator_draft_state: { Args: { _brief_token: string }; Returns: Json }
      get_creator_drafts: {
        Args: { _brief_token: string }
        Returns: {
          caption: string
          created_at: string
          file_name: string
          id: string
          platform: string
          post_url: string
          review_note: string
          reviewed_at: string
          status: string
        }[]
      }
      get_invoice_by_token: { Args: { _token: string }; Returns: Json }
      get_my_workspace_subdomain: { Args: never; Returns: string }
      get_plan_link_campaign: { Args: { _token: string }; Returns: string }
      get_profiles_by_ids: {
        Args: { _ids: string[] }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
          title: string
        }[]
      }
      get_public_storefront: { Args: { _agency_slug: string }; Returns: Json }
      get_report_link_campaign: { Args: { _token: string }; Returns: string }
      get_tenant_by_host: { Args: { _host: string }; Returns: Json }
      get_user_access_status: {
        Args: { _ids: string[] }
        Returns: {
          confirmed_at: string
          id: string
          invited_at: string
          last_sign_in_at: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
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
      render_contract: { Args: { _ci_id: string }; Returns: Json }
      review_contest_entry: {
        Args: { _decision: string; _entry_id: string }
        Returns: Json
      }
      run_contest_auto_polling: { Args: never; Returns: undefined }
      sign_contract_by_token: {
        Args: {
          _signature_data_url?: string
          _signer_name: string
          _token: string
          _user_agent?: string
        }
        Returns: Json
      }
      slugify: { Args: { _s: string }; Returns: string }
      staff_on_influencer: {
        Args: { _influencer_id: string; _user_id: string }
        Returns: boolean
      }
      submit_contest_entry: {
        Args: {
          _brief_token?: string
          _handle: string
          _platform: string
          _post_url: string
          _submitter_email: string
          _submitter_name: string
          _token: string
        }
        Returns: Json
      }
      submit_creator_draft: {
        Args: {
          _brief_token: string
          _caption?: string
          _creator_note?: string
          _file_name: string
          _file_path: string
          _file_size?: number
          _mime_type?: string
          _platform?: string
        }
        Returns: string
      }
      update_brief_status: {
        Args: { _status: string; _token: string }
        Returns: undefined
      }
      user_has_agency_access: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_brand_org_access: {
        Args: { _brand_org_id: string; _user_id: string }
        Returns: boolean
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
      agency_kind: "agency" | "media_house" | "brand"
      app_role:
        | "agency_admin"
        | "account_manager"
        | "client_viewer"
        | "influencer"
        | "client_user"
        | "super_admin"
        | "brand_owner"
        | "brand_viewer"
      approval_status: "pending" | "approved" | "changes_requested"
      booking_status: "new" | "reviewing" | "quoted" | "won" | "lost"
      campaign_status:
        | "draft"
        | "pitched"
        | "won"
        | "live"
        | "reporting"
        | "closed"
      inventory_kind: "owned_account" | "influencer" | "ad_slot" | "bundle"
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
      agency_kind: ["agency", "media_house", "brand"],
      app_role: [
        "agency_admin",
        "account_manager",
        "client_viewer",
        "influencer",
        "client_user",
        "super_admin",
        "brand_owner",
        "brand_viewer",
      ],
      approval_status: ["pending", "approved", "changes_requested"],
      booking_status: ["new", "reviewing", "quoted", "won", "lost"],
      campaign_status: [
        "draft",
        "pitched",
        "won",
        "live",
        "reporting",
        "closed",
      ],
      inventory_kind: ["owned_account", "influencer", "ad_slot", "bundle"],
      payout_status: ["pending", "processing", "paid", "failed"],
      platform: ["tiktok", "instagram", "youtube", "twitter", "facebook"],
      post_status: ["drafted", "approved", "live", "completed"],
    },
  },
} as const
