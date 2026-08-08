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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          chat_enabled: boolean
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          chat_enabled?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          chat_enabled?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          pinned_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          pinned_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          pinned_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_news: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_news_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_news_reads: {
        Row: {
          news_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          news_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          news_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_news_reads_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "company_news"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_news_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_attachments: {
        Row: {
          contract_id: string
          created_at: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_attachments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "staff_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_requests: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          reason: string | null
          request_type: Database["public"]["Enums"]["contract_request_type"]
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          status: Database["public"]["Enums"]["contract_request_status"]
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          reason?: string | null
          request_type: Database["public"]["Enums"]["contract_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          status?: Database["public"]["Enums"]["contract_request_status"]
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          request_type?: Database["public"]["Enums"]["contract_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          status?: Database["public"]["Enums"]["contract_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contract_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "staff_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          aim: string | null
          anticipated_problems: string | null
          attachments: Json
          created_at: string
          description: string | null
          game_link: string | null
          group_id: string
          homework: string | null
          id: string
          language_focus: string | null
          lesson_date: string | null
          lesson_number: number
          materials: string | null
          procedure: Json
          topic: string | null
        }
        Insert: {
          aim?: string | null
          anticipated_problems?: string | null
          attachments?: Json
          created_at?: string
          description?: string | null
          game_link?: string | null
          group_id: string
          homework?: string | null
          id?: string
          language_focus?: string | null
          lesson_date?: string | null
          lesson_number: number
          materials?: string | null
          procedure?: Json
          topic?: string | null
        }
        Update: {
          aim?: string | null
          anticipated_problems?: string | null
          attachments?: Json
          created_at?: string
          description?: string | null
          game_link?: string | null
          group_id?: string
          homework?: string | null
          id?: string
          language_focus?: string | null
          lesson_date?: string | null
          lesson_number?: number
          materials?: string | null
          procedure?: Json
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          participant_one: string
          participant_two: string
          request_status: Database["public"]["Enums"]["dm_request_status"]
          status: Database["public"]["Enums"]["dm_status"]
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          participant_one: string
          participant_two: string
          request_status?: Database["public"]["Enums"]["dm_request_status"]
          status?: Database["public"]["Enums"]["dm_status"]
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          participant_one?: string
          participant_two?: string
          request_status?: Database["public"]["Enums"]["dm_request_status"]
          status?: Database["public"]["Enums"]["dm_status"]
        }
        Relationships: [
          {
            foreignKeyName: "dm_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_participant_one_fkey"
            columns: ["participant_one"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_participant_two_fkey"
            columns: ["participant_two"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          staff_id: string
          title: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          staff_id: string
          title: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          staff_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      future_projects: {
        Row: {
          created_at: string
          estimated_budget: number | null
          id: string
          initial_steps: Json
          title: string
        }
        Insert: {
          created_at?: string
          estimated_budget?: number | null
          id?: string
          initial_steps?: Json
          title: string
        }
        Update: {
          created_at?: string
          estimated_budget?: number | null
          id?: string
          initial_steps?: Json
          title?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          assigned_ta_id: string | null
          configuration: Json
          course_name: string | null
          created_at: string
          id: string
          name: string
          schedule_type: Database["public"]["Enums"]["schedule_type"] | null
          teacher_id: string
        }
        Insert: {
          assigned_ta_id?: string | null
          configuration?: Json
          course_name?: string | null
          created_at?: string
          id?: string
          name: string
          schedule_type?: Database["public"]["Enums"]["schedule_type"] | null
          teacher_id: string
        }
        Update: {
          assigned_ta_id?: string | null
          configuration?: Json
          course_name?: string | null
          created_at?: string
          id?: string
          name?: string
          schedule_type?: Database["public"]["Enums"]["schedule_type"] | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_assigned_ta_id_fkey"
            columns: ["assigned_ta_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_assignments: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          group_id: string
          id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          group_id: string
          id?: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          group_id?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_students: {
        Row: {
          created_at: string
          full_name: string
          group_id: string
          id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          group_id: string
          id?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_students_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_submissions: {
        Row: {
          assignment_id: string
          grade: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["homework_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          grade?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["homework_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          grade?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["homework_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "homework_students"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_seen: boolean
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["issue_status"]
          title: string
          voice_url: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_seen?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["issue_status"]
          title: string
          voice_url?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_seen?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["issue_status"]
          title?: string
          voice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issues_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_comments: {
        Row: {
          comment_text: string
          created_at: string
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_comments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plan_comments: {
        Row: {
          comment_text: string
          created_at: string
          id: string
          lesson_plan_day_id: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          id?: string
          lesson_plan_day_id: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          id?: string
          lesson_plan_day_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plan_comments_lesson_plan_day_id_fkey"
            columns: ["lesson_plan_day_id"]
            isOneToOne: false
            referencedRelation: "lesson_plan_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plan_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plan_compliance_alerts: {
        Row: {
          created_at: string
          id: string
          is_seen: boolean
          report_date: string
          summary: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_seen?: boolean
          report_date: string
          summary: string
        }
        Update: {
          created_at?: string
          id?: string
          is_seen?: boolean
          report_date?: string
          summary?: string
        }
        Relationships: []
      }
      lesson_plan_cron_runs: {
        Row: {
          date_key: string
          ran_at: string
        }
        Insert: {
          date_key: string
          ran_at?: string
        }
        Update: {
          date_key?: string
          ran_at?: string
        }
        Relationships: []
      }
      lesson_plan_days: {
        Row: {
          id: string
          notes: string | null
          topic: string | null
          weekday: Database["public"]["Enums"]["weekday"]
          weekly_plan_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          topic?: string | null
          weekday: Database["public"]["Enums"]["weekday"]
          weekly_plan_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          topic?: string | null
          weekday?: Database["public"]["Enums"]["weekday"]
          weekly_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plan_days_weekly_plan_id_fkey"
            columns: ["weekly_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_lesson_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plans: {
        Row: {
          created_at: string
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          plan_date: string
          teacher_id: string
          topic: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          plan_date: string
          teacher_id: string
          topic: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          plan_date?: string
          teacher_id?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plans_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_completed: boolean
          staff_id: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_completed?: boolean
          staff_id: string
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_completed?: boolean
          staff_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          entry_type: Database["public"]["Enums"]["performance_entry_type"]
          id: string
          reason: string | null
          staff_id: string
          warning_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          entry_type: Database["public"]["Enums"]["performance_entry_type"]
          id?: string
          reason?: string | null
          staff_id: string
          warning_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          entry_type?: Database["public"]["Enums"]["performance_entry_type"]
          id?: string
          reason?: string | null
          staff_id?: string
          warning_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_entries_warning_id_fkey"
            columns: ["warning_id"]
            isOneToOne: false
            referencedRelation: "staff_warnings"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          message: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          message: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string
          email: string | null
          emergency_contact: string | null
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          level_updated_at: string
          must_change_password: boolean
          phone: string
          role: Database["public"]["Enums"]["staff_role"]
          teacher_level: Database["public"]["Enums"]["teacher_level"]
          telegram_id: number | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth: string
          email?: string | null
          emergency_contact?: string | null
          first_name: string
          id: string
          is_active?: boolean
          last_name: string
          level_updated_at?: string
          must_change_password?: boolean
          phone: string
          role?: Database["public"]["Enums"]["staff_role"]
          teacher_level?: Database["public"]["Enums"]["teacher_level"]
          telegram_id?: number | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string
          email?: string | null
          emergency_contact?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          level_updated_at?: string
          must_change_password?: boolean
          phone?: string
          role?: Database["public"]["Enums"]["staff_role"]
          teacher_level?: Database["public"]["Enums"]["teacher_level"]
          telegram_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_goals: {
        Row: {
          created_at: string
          failure_reason: string | null
          id: string
          progress_percentage: number
          solution: string | null
          status: Database["public"]["Enums"]["roadmap_status"]
          timeframe: Database["public"]["Enums"]["roadmap_timeframe"]
          title: string
        }
        Insert: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          progress_percentage?: number
          solution?: string | null
          status?: Database["public"]["Enums"]["roadmap_status"]
          timeframe: Database["public"]["Enums"]["roadmap_timeframe"]
          title: string
        }
        Update: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          progress_percentage?: number
          solution?: string | null
          status?: Database["public"]["Enums"]["roadmap_status"]
          timeframe?: Database["public"]["Enums"]["roadmap_timeframe"]
          title?: string
        }
        Relationships: []
      }
      self_development: {
        Row: {
          achievements: string | null
          ceo_rating: string | null
          ceo_score: number | null
          created_at: string
          id: string
          month: string
          user_id: string
          value_added: string | null
        }
        Insert: {
          achievements?: string | null
          ceo_rating?: string | null
          ceo_score?: number | null
          created_at?: string
          id?: string
          month: string
          user_id: string
          value_added?: string | null
        }
        Update: {
          achievements?: string | null
          ceo_rating?: string | null
          ceo_score?: number | null
          created_at?: string
          id?: string
          month?: string
          user_id?: string
          value_added?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "self_development_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_chats: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          media_type: Database["public"]["Enums"]["chat_media_type"]
          media_url: string | null
          message_text: string | null
          pinned_at: string | null
          reactions: Json
          receiver_id: string | null
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          media_type?: Database["public"]["Enums"]["chat_media_type"]
          media_url?: string | null
          message_text?: string | null
          pinned_at?: string | null
          reactions?: Json
          receiver_id?: string | null
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          media_type?: Database["public"]["Enums"]["chat_media_type"]
          media_url?: string | null
          message_text?: string | null
          pinned_at?: string | null
          reactions?: Json
          receiver_id?: string | null
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_chats_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_chats_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "staff_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_chats_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_contracts: {
        Row: {
          created_at: string
          created_by: string
          end_date: string | null
          id: string
          staff_id: string
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          end_date?: string | null
          id?: string
          staff_id: string
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          end_date?: string | null
          id?: string
          staff_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_contracts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_duties: {
        Row: {
          contract_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          staff_id: string
          title: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          staff_id: string
          title: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          staff_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_duties_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "staff_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_duties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_duties_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_performance: {
        Row: {
          bonus: number
          current_tier: Database["public"]["Enums"]["staff_tier"]
          id: string
          months_in_tier: number
          notes: string | null
          penalty: number
          staff_id: string
          updated_at: string
          updated_by: string | null
          weekly_progress_score: number
        }
        Insert: {
          bonus?: number
          current_tier?: Database["public"]["Enums"]["staff_tier"]
          id?: string
          months_in_tier?: number
          notes?: string | null
          penalty?: number
          staff_id: string
          updated_at?: string
          updated_by?: string | null
          weekly_progress_score?: number
        }
        Update: {
          bonus?: number
          current_tier?: Database["public"]["Enums"]["staff_tier"]
          id?: string
          months_in_tier?: number
          notes?: string | null
          penalty?: number
          staff_id?: string
          updated_at?: string
          updated_by?: string | null
          weekly_progress_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_performance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_warnings: {
        Row: {
          created_at: string
          id: string
          is_seen: boolean
          issued_by: string
          reason: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_seen?: boolean
          issued_by: string
          reason: string
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_seen?: boolean
          issued_by?: string
          reason?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_warnings_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_warnings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          action_type: string
          created_at: string
          description: string
          id: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          description: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string
          assigned_to: string
          created_at: string
          deadline: string
          description: string | null
          due_date: string | null
          id: string
          is_seen: boolean
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by: string
          assigned_to: string
          created_at?: string
          deadline: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_seen?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          assigned_to?: string
          created_at?: string
          deadline?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_seen?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_group_chats: {
        Row: {
          added_at: string
          chat_id: number
          title: string | null
        }
        Insert: {
          added_at?: string
          chat_id: number
          title?: string | null
        }
        Update: {
          added_at?: string
          chat_id?: number
          title?: string | null
        }
        Relationships: []
      }
      telegram_link_tokens: {
        Row: {
          created_at: string
          expires_at: string
          profile_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          profile_id: string
          token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          profile_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_lesson_plans: {
        Row: {
          created_at: string
          end_date: string
          group_id: string
          id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          group_id: string
          id?: string
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          group_id?: string
          id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_lesson_plans_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["staff_role"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_ta: { Args: { target_group_id: string }; Returns: boolean }
      is_ceo_or_admin_manager: { Args: never; Returns: boolean }
      is_group_owner: { Args: { target_group_id: string }; Returns: boolean }
      log_system_action: {
        Args: { p_action_type: string; p_description: string }
        Returns: undefined
      }
      mark_company_news_seen: { Args: never; Returns: undefined }
      mark_conversation_read: {
        Args: { other_user_id: string }
        Returns: undefined
      }
      mark_issue_seen: { Args: { issue_id: string }; Returns: undefined }
      mark_issues_seen: { Args: never; Returns: undefined }
      mark_lesson_plan_alerts_seen: { Args: never; Returns: undefined }
      mark_staff_chat_read: { Args: { message_id: string }; Returns: undefined }
      mark_tasks_seen: { Args: never; Returns: undefined }
      mark_warnings_seen: { Args: never; Returns: undefined }
      respond_to_dm_request: {
        Args: { accept: boolean; target_conversation_id: string }
        Returns: undefined
      }
      start_dm_conversation: {
        Args: { other_user_id: string }
        Returns: {
          id: string
          request_status: Database["public"]["Enums"]["dm_request_status"]
        }[]
      }
      toggle_staff_chat_reaction: {
        Args: { emoji: string; message_id: string }
        Returns: Json
      }
      unseen_company_news_count: { Args: never; Returns: number }
    }
    Enums: {
      chat_media_type: "image" | "video" | "voice" | "none"
      contract_request_status: "pending" | "approved" | "rejected"
      contract_request_type: "freeze" | "extend"
      contract_status: "active" | "frozen" | "ended"
      dm_request_status: "pending" | "accepted"
      dm_status: "normal" | "important"
      homework_status: "pending" | "submitted" | "graded" | "missing"
      issue_status: "open" | "in_progress" | "done"
      performance_entry_type: "bonus" | "penalty"
      roadmap_status: "pending" | "done" | "failed"
      roadmap_timeframe: "weekly" | "monthly" | "quarterly"
      schedule_type: "odd" | "even"
      staff_role:
        | "ceo"
        | "admin_manager"
        | "teacher"
        | "assistant"
        | "smm"
        | "mobilgrof"
        | "it_developer"
        | "smm_mobilgrof"
      staff_tier: "A" | "B" | "C"
      task_status: "pending" | "in_progress" | "done"
      teacher_level:
        | "C"
        | "C+"
        | "C++"
        | "B"
        | "B+"
        | "B++"
        | "A"
        | "A+"
        | "A++"
      weekday:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      chat_media_type: ["image", "video", "voice", "none"],
      contract_request_status: ["pending", "approved", "rejected"],
      contract_request_type: ["freeze", "extend"],
      contract_status: ["active", "frozen", "ended"],
      dm_request_status: ["pending", "accepted"],
      dm_status: ["normal", "important"],
      homework_status: ["pending", "submitted", "graded", "missing"],
      issue_status: ["open", "in_progress", "done"],
      performance_entry_type: ["bonus", "penalty"],
      roadmap_status: ["pending", "done", "failed"],
      roadmap_timeframe: ["weekly", "monthly", "quarterly"],
      schedule_type: ["odd", "even"],
      staff_role: [
        "ceo",
        "admin_manager",
        "teacher",
        "assistant",
        "smm",
        "mobilgrof",
        "it_developer",
        "smm_mobilgrof",
      ],
      staff_tier: ["A", "B", "C"],
      task_status: ["pending", "in_progress", "done"],
      teacher_level: ["C", "C+", "C++", "B", "B+", "B++", "A", "A+", "A++"],
      weekday: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
    },
  },
} as const
