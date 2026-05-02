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
      ai_chat_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_calls: Json | null
          tool_name: string | null
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_calls?: Json | null
          tool_name?: string | null
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_calls?: Json | null
          tool_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          author_id: string
          body: string
          client_id: string
          created_at: string
          external_id: string | null
          id: string
          source: string
        }
        Insert: {
          author_id: string
          body: string
          client_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          source?: string
        }
        Update: {
          author_id?: string
          body?: string
          client_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_task_items: {
        Row: {
          client_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          daily_task_id: string | null
          id: string
          message_copy: string | null
          note: string | null
          sort_order: number
          status: string
          task_date: string
          task_howto: string | null
          task_label: string
          task_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          daily_task_id?: string | null
          id?: string
          message_copy?: string | null
          note?: string | null
          sort_order?: number
          status?: string
          task_date: string
          task_howto?: string | null
          task_label: string
          task_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          daily_task_id?: string | null
          id?: string
          message_copy?: string | null
          note?: string | null
          sort_order?: number
          status?: string
          task_date?: string
          task_howto?: string | null
          task_label?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_task_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_task_items_daily_task_id_fkey"
            columns: ["daily_task_id"]
            isOneToOne: false
            referencedRelation: "clinic_daily_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks: {
        Row: {
          assigned_to: string
          client_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          client_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          client_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          assigned_to: string | null
          board_position: number
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          sector_id: string | null
          stage_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          board_position?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          sector_id?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          board_position?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          sector_id?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "kanban_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_appointments: {
        Row: {
          appointment_at: string
          contact_id: string | null
          created_at: string
          doctor_external_id: string | null
          doctor_id: string | null
          doctor_name: string | null
          duration_min: number | null
          external_id: string | null
          id: string
          notes: string | null
          patient_external_id: string | null
          patient_name: string
          patient_phone: string | null
          status: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          appointment_at: string
          contact_id?: string | null
          created_at?: string
          doctor_external_id?: string | null
          doctor_id?: string | null
          doctor_name?: string | null
          duration_min?: number | null
          external_id?: string | null
          id?: string
          notes?: string | null
          patient_external_id?: string | null
          patient_name: string
          patient_phone?: string | null
          status?: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          appointment_at?: string
          contact_id?: string | null
          created_at?: string
          doctor_external_id?: string | null
          doctor_id?: string | null
          doctor_name?: string | null
          duration_min?: number | null
          external_id?: string | null
          id?: string
          notes?: string | null
          patient_external_id?: string | null
          patient_name?: string
          patient_phone?: string | null
          status?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "clinic_doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_daily_tasks: {
        Row: {
          appointment_at: string | null
          appointment_id: string | null
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          contact_id: string | null
          created_at: string
          doctor_id: string | null
          doctor_name: string | null
          id: string
          notes: string | null
          patient_name: string
          patient_phone: string | null
          status: string
          task_date: string
          task_type: string
          updated_at: string
        }
        Insert: {
          appointment_at?: string | null
          appointment_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          doctor_id?: string | null
          doctor_name?: string | null
          id?: string
          notes?: string | null
          patient_name: string
          patient_phone?: string | null
          status?: string
          task_date: string
          task_type: string
          updated_at?: string
        }
        Update: {
          appointment_at?: string | null
          appointment_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          doctor_id?: string | null
          doctor_name?: string | null
          id?: string
          notes?: string | null
          patient_name?: string
          patient_phone?: string | null
          status?: string
          task_date?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_daily_tasks_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "clinic_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_daily_tasks_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "clinic_doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_doctors: {
        Row: {
          active: boolean
          assigned_user_id: string | null
          color: string | null
          created_at: string
          external_id: string | null
          id: string
          name: string
          name_locked: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_user_id?: string | null
          color?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          name: string
          name_locked?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_user_id?: string | null
          color?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          name?: string
          name_locked?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      contact_imports: {
        Row: {
          created_at: string
          created_count: number
          default_sector_id: string | null
          error_count: number
          error_message: string | null
          file_name: string | null
          id: string
          imported_by: string
          status: string
          total_rows: number
          updated_at: string
          updated_count: number
        }
        Insert: {
          created_at?: string
          created_count?: number
          default_sector_id?: string | null
          error_count?: number
          error_message?: string | null
          file_name?: string | null
          id?: string
          imported_by: string
          status?: string
          total_rows?: number
          updated_at?: string
          updated_count?: number
        }
        Update: {
          created_at?: string
          created_count?: number
          default_sector_id?: string | null
          error_count?: number
          error_message?: string | null
          file_name?: string | null
          id?: string
          imported_by?: string
          status?: string
          total_rows?: number
          updated_at?: string
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "contact_imports_default_sector_id_fkey"
            columns: ["default_sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          birth_date: string | null
          city: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          email: string | null
          external_id: string | null
          id: string
          import_id: string | null
          imported_at: string | null
          is_active: boolean
          last_appointment_at: string | null
          last_synced_at: string | null
          name: string
          notes: string | null
          phone: string | null
          phone_normalized: string | null
          sector_id: string | null
          source: string | null
          state: string | null
          tags: string[] | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          external_id?: string | null
          id?: string
          import_id?: string | null
          imported_at?: string | null
          is_active?: boolean
          last_appointment_at?: string | null
          last_synced_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          sector_id?: string | null
          source?: string | null
          state?: string | null
          tags?: string[] | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          external_id?: string | null
          id?: string
          import_id?: string | null
          imported_at?: string | null
          is_active?: boolean
          last_appointment_at?: string | null
          last_synced_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          sector_id?: string | null
          source?: string | null
          state?: string | null
          tags?: string[] | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_plan_deliverables: {
        Row: {
          created_at: string
          daily_plan_id: string
          due_date: string | null
          id: string
          responsible: string | null
          responsible_user_id: string | null
          sort_order: number
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          daily_plan_id: string
          due_date?: string | null
          id?: string
          responsible?: string | null
          responsible_user_id?: string | null
          sort_order?: number
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          daily_plan_id?: string
          due_date?: string | null
          id?: string
          responsible?: string | null
          responsible_user_id?: string | null
          sort_order?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_plan_deliverables_daily_plan_id_fkey"
            columns: ["daily_plan_id"]
            isOneToOne: false
            referencedRelation: "manager_daily_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_priorities: {
        Row: {
          acknowledged_at: string | null
          completed_at: string | null
          completion_note: string | null
          created_at: string
          id: string
          manager_id: string
          mission_main: string
          mission_main_done: boolean
          mission_main_done_at: string | null
          priority_date: string
          secondary_1: string | null
          secondary_1_done: boolean
          secondary_1_done_at: string | null
          secondary_2: string | null
          secondary_2_done: boolean
          secondary_2_done_at: string | null
          status: string
          updated_at: string
          user_id: string
          yesterday_feedback: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          id?: string
          manager_id: string
          mission_main: string
          mission_main_done?: boolean
          mission_main_done_at?: string | null
          priority_date?: string
          secondary_1?: string | null
          secondary_1_done?: boolean
          secondary_1_done_at?: string | null
          secondary_2?: string | null
          secondary_2_done?: boolean
          secondary_2_done_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          yesterday_feedback?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          id?: string
          manager_id?: string
          mission_main?: string
          mission_main_done?: boolean
          mission_main_done_at?: string | null
          priority_date?: string
          secondary_1?: string | null
          secondary_1_done?: boolean
          secondary_1_done_at?: string | null
          secondary_2?: string | null
          secondary_2_done?: boolean
          secondary_2_done_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          yesterday_feedback?: string | null
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          created_at: string
          data: Json
          id: string
          notes: string | null
          report_date: string
          sector_id: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          notes?: string | null
          report_date?: string
          sector_id: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          notes?: string | null
          report_date?: string
          sector_id?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string | null
          refresh_token: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kanban_stages: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          sector_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          sector_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          sector_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_stages_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_daily_assignments: {
        Row: {
          assignee_id: string
          created_at: string
          daily_plan_id: string
          id: string
          main_mission: string
          observation: string | null
          secondary_1: string | null
          secondary_2: string | null
          updated_at: string
        }
        Insert: {
          assignee_id: string
          created_at?: string
          daily_plan_id: string
          id?: string
          main_mission: string
          observation?: string | null
          secondary_1?: string | null
          secondary_2?: string | null
          updated_at?: string
        }
        Update: {
          assignee_id?: string
          created_at?: string
          daily_plan_id?: string
          id?: string
          main_mission?: string
          observation?: string | null
          secondary_1?: string | null
          secondary_2?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_daily_assignments_daily_plan_id_fkey"
            columns: ["daily_plan_id"]
            isOneToOne: false
            referencedRelation: "manager_daily_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_daily_plans: {
        Row: {
          closing_checklist: Json | null
          conducted_by: string | null
          created_at: string
          during_checklist: Json | null
          id: string
          main_mission: string | null
          manager_id: string
          meeting_duration_min: number | null
          meeting_end: string | null
          meeting_start: string | null
          method: string
          needs_support: string | null
          not_today: string | null
          notes: string | null
          opening_checklist: Json | null
          participant_1: string | null
          participant_2: string | null
          participant_3: string | null
          pending_next: string | null
          plan_date: string
          secondary_1: string | null
          secondary_2: string | null
          to_block: string | null
          to_delegate: string | null
          today_bottlenecks: string | null
          today_fixed: string | null
          today_main_risk: string | null
          today_urgencies: string | null
          updated_at: string
          yesterday_advanced: string | null
          yesterday_blocked: string | null
          yesterday_main_mission: string | null
          yesterday_pending: string | null
          yesterday_status: string | null
        }
        Insert: {
          closing_checklist?: Json | null
          conducted_by?: string | null
          created_at?: string
          during_checklist?: Json | null
          id?: string
          main_mission?: string | null
          manager_id: string
          meeting_duration_min?: number | null
          meeting_end?: string | null
          meeting_start?: string | null
          method?: string
          needs_support?: string | null
          not_today?: string | null
          notes?: string | null
          opening_checklist?: Json | null
          participant_1?: string | null
          participant_2?: string | null
          participant_3?: string | null
          pending_next?: string | null
          plan_date?: string
          secondary_1?: string | null
          secondary_2?: string | null
          to_block?: string | null
          to_delegate?: string | null
          today_bottlenecks?: string | null
          today_fixed?: string | null
          today_main_risk?: string | null
          today_urgencies?: string | null
          updated_at?: string
          yesterday_advanced?: string | null
          yesterday_blocked?: string | null
          yesterday_main_mission?: string | null
          yesterday_pending?: string | null
          yesterday_status?: string | null
        }
        Update: {
          closing_checklist?: Json | null
          conducted_by?: string | null
          created_at?: string
          during_checklist?: Json | null
          id?: string
          main_mission?: string | null
          manager_id?: string
          meeting_duration_min?: number | null
          meeting_end?: string | null
          meeting_start?: string | null
          method?: string
          needs_support?: string | null
          not_today?: string | null
          notes?: string | null
          opening_checklist?: Json | null
          participant_1?: string | null
          participant_2?: string | null
          participant_3?: string | null
          pending_next?: string | null
          plan_date?: string
          secondary_1?: string | null
          secondary_2?: string | null
          to_block?: string | null
          to_delegate?: string | null
          today_bottlenecks?: string | null
          today_fixed?: string | null
          today_main_risk?: string | null
          today_urgencies?: string | null
          updated_at?: string
          yesterday_advanced?: string | null
          yesterday_blocked?: string | null
          yesterday_main_mission?: string | null
          yesterday_pending?: string | null
          yesterday_status?: string | null
        }
        Relationships: []
      }
      manager_weekly_plans: {
        Row: {
          classification: string | null
          created_at: string
          fixed_commitments: string | null
          id: string
          ind_alignments_done: number | null
          ind_blocks_protected: number | null
          ind_days_tomorrow_defined: number | null
          ind_interruptions: number | null
          ind_meetings_under_31: number | null
          ind_missions_done: number | null
          ind_tasks_delegated: number | null
          ind_tasks_eliminated: number | null
          manager_id: string
          method: string
          mission_blocks: string | null
          not_this_week: string | null
          notes: string | null
          prev_excess_alignment: string | null
          prev_excess_execution: string | null
          prev_repeated_block: string | null
          prev_single_correction: string | null
          prev_time_wasters: string | null
          prev_what_worked: string | null
          secondary_blocks: string | null
          updated_at: string
          week_focus: string | null
          week_start: string
        }
        Insert: {
          classification?: string | null
          created_at?: string
          fixed_commitments?: string | null
          id?: string
          ind_alignments_done?: number | null
          ind_blocks_protected?: number | null
          ind_days_tomorrow_defined?: number | null
          ind_interruptions?: number | null
          ind_meetings_under_31?: number | null
          ind_missions_done?: number | null
          ind_tasks_delegated?: number | null
          ind_tasks_eliminated?: number | null
          manager_id: string
          method?: string
          mission_blocks?: string | null
          not_this_week?: string | null
          notes?: string | null
          prev_excess_alignment?: string | null
          prev_excess_execution?: string | null
          prev_repeated_block?: string | null
          prev_single_correction?: string | null
          prev_time_wasters?: string | null
          prev_what_worked?: string | null
          secondary_blocks?: string | null
          updated_at?: string
          week_focus?: string | null
          week_start: string
        }
        Update: {
          classification?: string | null
          created_at?: string
          fixed_commitments?: string | null
          id?: string
          ind_alignments_done?: number | null
          ind_blocks_protected?: number | null
          ind_days_tomorrow_defined?: number | null
          ind_interruptions?: number | null
          ind_meetings_under_31?: number | null
          ind_missions_done?: number | null
          ind_tasks_delegated?: number | null
          ind_tasks_eliminated?: number | null
          manager_id?: string
          method?: string
          mission_blocks?: string | null
          not_this_week?: string | null
          notes?: string | null
          prev_excess_alignment?: string | null
          prev_excess_execution?: string | null
          prev_repeated_block?: string | null
          prev_single_correction?: string | null
          prev_time_wasters?: string | null
          prev_what_worked?: string | null
          secondary_blocks?: string | null
          updated_at?: string
          week_focus?: string | null
          week_start?: string
        }
        Relationships: []
      }
      monthly_goals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          new_clients_target: number
          new_patients_target: number
          notes: string | null
          period_month: string
          profit_target: number
          revenue_target: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_clients_target?: number
          new_patients_target?: number
          notes?: string | null
          period_month: string
          profit_target?: number
          revenue_target?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_clients_target?: number
          new_patients_target?: number
          notes?: string | null
          period_month?: string
          profit_target?: number
          revenue_target?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      priority_messages: {
        Row: {
          author_id: string
          created_at: string
          id: string
          message: string
          priority_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          message: string
          priority_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          message?: string
          priority_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "priority_messages_priority_id_fkey"
            columns: ["priority_id"]
            isOneToOne: false
            referencedRelation: "daily_priorities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          sector_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          sector_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          sector_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_tasks: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          frequency: string | null
          id: string
          sector_id: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          frequency?: string | null
          id?: string
          sector_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          frequency?: string | null
          id?: string
          sector_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_tasks_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount: number
          client_id: string
          cost: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_new_patient: boolean
          payment_method_id: string | null
          profit: number | null
          sale_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_new_patient?: boolean
          payment_method_id?: string | null
          profit?: number | null
          sale_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_new_patient?: boolean
          payment_method_id?: string | null
          profit?: number | null
          sale_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      task_completions: {
        Row: {
          completed_at: string
          completion_date: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          completion_date?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          completion_date?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "routine_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      team_feedbacks: {
        Row: {
          attitude_1: string | null
          attitude_2: string | null
          attitude_3: string | null
          closing_message: string | null
          collaborator_response: string | null
          collaborator_signature_name: string | null
          collaborator_signed_at: string | null
          commitment_goal: string | null
          commitment_how: string | null
          commitment_meetings: string | null
          created_at: string
          deliverables: string | null
          department: string | null
          expected_behavior: string | null
          feedback_type: string
          id: string
          last_week_behavior: string | null
          last_week_closings: string | null
          last_week_conversion: string | null
          last_week_focus_energy: string | null
          last_week_hit_goal: string | null
          last_week_numbers: string | null
          last_week_organization: string | null
          manager_id: string
          manager_signature_name: string | null
          manager_signed_at: string | null
          needs_improvement: string | null
          next_alignment_date: string | null
          non_negotiables: string | null
          observation: string | null
          period_end: string | null
          period_start: string | null
          reference_date: string
          reference_month: string
          role: string | null
          updated_at: string
          user_id: string
          week_of_month: number
        }
        Insert: {
          attitude_1?: string | null
          attitude_2?: string | null
          attitude_3?: string | null
          closing_message?: string | null
          collaborator_response?: string | null
          collaborator_signature_name?: string | null
          collaborator_signed_at?: string | null
          commitment_goal?: string | null
          commitment_how?: string | null
          commitment_meetings?: string | null
          created_at?: string
          deliverables?: string | null
          department?: string | null
          expected_behavior?: string | null
          feedback_type?: string
          id?: string
          last_week_behavior?: string | null
          last_week_closings?: string | null
          last_week_conversion?: string | null
          last_week_focus_energy?: string | null
          last_week_hit_goal?: string | null
          last_week_numbers?: string | null
          last_week_organization?: string | null
          manager_id: string
          manager_signature_name?: string | null
          manager_signed_at?: string | null
          needs_improvement?: string | null
          next_alignment_date?: string | null
          non_negotiables?: string | null
          observation?: string | null
          period_end?: string | null
          period_start?: string | null
          reference_date?: string
          reference_month?: string
          role?: string | null
          updated_at?: string
          user_id: string
          week_of_month?: number
        }
        Update: {
          attitude_1?: string | null
          attitude_2?: string | null
          attitude_3?: string | null
          closing_message?: string | null
          collaborator_response?: string | null
          collaborator_signature_name?: string | null
          collaborator_signed_at?: string | null
          commitment_goal?: string | null
          commitment_how?: string | null
          commitment_meetings?: string | null
          created_at?: string
          deliverables?: string | null
          department?: string | null
          expected_behavior?: string | null
          feedback_type?: string
          id?: string
          last_week_behavior?: string | null
          last_week_closings?: string | null
          last_week_conversion?: string | null
          last_week_focus_energy?: string | null
          last_week_hit_goal?: string | null
          last_week_numbers?: string | null
          last_week_organization?: string | null
          manager_id?: string
          manager_signature_name?: string | null
          manager_signed_at?: string | null
          needs_improvement?: string | null
          next_alignment_date?: string | null
          non_negotiables?: string | null
          observation?: string | null
          period_end?: string | null
          period_start?: string | null
          reference_date?: string
          reference_month?: string
          role?: string | null
          updated_at?: string
          user_id?: string
          week_of_month?: number
        }
        Relationships: []
      }
      time_clock_correction_requests: {
        Row: {
          created_at: string
          entry_date: string
          entry_id: string | null
          id: string
          reason: string
          requested_clock_in: string | null
          requested_clock_out: string | null
          requested_lunch_end: string | null
          requested_lunch_start: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          entry_id?: string | null
          id?: string
          reason: string
          requested_clock_in?: string | null
          requested_clock_out?: string | null
          requested_lunch_end?: string | null
          requested_lunch_start?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          entry_id?: string | null
          id?: string
          reason?: string
          requested_clock_in?: string | null
          requested_clock_out?: string | null
          requested_lunch_end?: string | null
          requested_lunch_start?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      time_clock_edit_log: {
        Row: {
          created_at: string
          edited_by: string
          entry_id: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          reason: string | null
        }
        Insert: {
          created_at?: string
          edited_by: string
          entry_id: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
        }
        Update: {
          created_at?: string
          edited_by?: string
          entry_id?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      time_clock_entries: {
        Row: {
          clock_in: string | null
          clock_out: string | null
          created_at: string
          edit_reason: string | null
          edited_at: string | null
          edited_by: string | null
          entry_date: string
          id: string
          lunch_end: string | null
          lunch_start: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          entry_date?: string
          id?: string
          lunch_end?: string | null
          lunch_start?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          entry_date?: string
          id?: string
          lunch_end?: string | null
          lunch_start?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_working_hours: {
        Row: {
          active: boolean
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          classification: string
          client_id: string | null
          created_at: string
          from_name: string | null
          from_phone: string
          id: string
          message_text: string | null
          message_type: string | null
          received_at: string
          wa_message_id: string | null
        }
        Insert: {
          classification?: string
          client_id?: string | null
          created_at?: string
          from_name?: string | null
          from_phone: string
          id?: string
          message_text?: string | null
          message_type?: string | null
          received_at?: string
          wa_message_id?: string | null
        }
        Update: {
          classification?: string
          client_id?: string | null
          created_at?: string
          from_name?: string | null
          from_phone?: string
          id?: string
          message_text?: string | null
          message_type?: string | null
          received_at?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_pending_attendances: {
        Row: {
          assigned_to: string | null
          classification: string
          client_id: string | null
          created_at: string
          from_name: string | null
          from_phone: string
          id: string
          last_message_at: string
          resolved_at: string | null
          resolved_by: string | null
          sector_id: string | null
          status: string
          transfer_note: string | null
          transferred_from: string | null
          transferred_to: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          classification?: string
          client_id?: string | null
          created_at?: string
          from_name?: string | null
          from_phone: string
          id?: string
          last_message_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sector_id?: string | null
          status?: string
          transfer_note?: string | null
          transferred_from?: string | null
          transferred_to?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          classification?: string
          client_id?: string | null
          created_at?: string
          from_name?: string | null
          from_phone?: string
          id?: string
          last_message_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sector_id?: string | null
          status?: string
          transfer_note?: string | null
          transferred_from?: string | null
          transferred_to?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_pending_attendances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_pending_attendances_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sessions: {
        Row: {
          client_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          notes: string | null
          source: string
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          source?: string
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          source?: string
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
      normalize_phone: { Args: { _phone: string }; Returns: string }
      transfer_attendance: {
        Args: { _attendance_id: string; _note?: string; _to_user: string }
        Returns: undefined
      }
      user_owns_doctor: {
        Args: { _doctor_id: string; _user_id: string }
        Returns: boolean
      }
      whatsapp_user_minutes: {
        Args: { _end_date: string; _start_date: string }
        Returns: {
          session_count: number
          total_minutes: number
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "member"
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
      app_role: ["admin", "member"],
    },
  },
} as const
