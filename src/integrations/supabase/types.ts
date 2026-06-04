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
      client_nutrition_documents: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      client_workout_assignments: {
        Row: {
          assigned_at: string
          client_id: string
          coach_id: string
          created_at: string
          days: string[] | null
          id: string
          is_active: boolean
          notes: string | null
          plan_id: string
          start_date: string | null
          unassigned_at: string | null
          updated_at: string
          weeks: number | null
        }
        Insert: {
          assigned_at?: string
          client_id: string
          coach_id: string
          created_at?: string
          days?: string[] | null
          id?: string
          is_active?: boolean
          notes?: string | null
          plan_id: string
          start_date?: string | null
          unassigned_at?: string | null
          updated_at?: string
          weeks?: number | null
        }
        Update: {
          assigned_at?: string
          client_id?: string
          coach_id?: string
          created_at?: string
          days?: string[] | null
          id?: string
          is_active?: boolean
          notes?: string | null
          plan_id?: string
          start_date?: string | null
          unassigned_at?: string | null
          updated_at?: string
          weeks?: number | null
        }
        Relationships: []
      }
      coach_email_connections: {
        Row: {
          access_token: string | null
          coach_id: string
          connected_at: string
          email: string
          id: string
          refresh_token: string
          scope: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          coach_id: string
          connected_at?: string
          email: string
          id?: string
          refresh_token: string
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          coach_id?: string
          connected_at?: string
          email?: string
          id?: string
          refresh_token?: string
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coach_messages: {
        Row: {
          client_actions: string[]
          client_attention: string[]
          client_id: string
          client_positive: string[]
          coach_id: string
          created_at: string
          generated_at: string
          id: string
          published_at: string | null
          updated_at: string
          voice_memo: string
          voice_memo_recorded_at: string | null
        }
        Insert: {
          client_actions?: string[]
          client_attention?: string[]
          client_id: string
          client_positive?: string[]
          coach_id: string
          created_at?: string
          generated_at?: string
          id?: string
          published_at?: string | null
          updated_at?: string
          voice_memo?: string
          voice_memo_recorded_at?: string | null
        }
        Update: {
          client_actions?: string[]
          client_attention?: string[]
          client_id?: string
          client_positive?: string[]
          coach_id?: string
          created_at?: string
          generated_at?: string
          id?: string
          published_at?: string | null
          updated_at?: string
          voice_memo?: string
          voice_memo_recorded_at?: string | null
        }
        Relationships: []
      }
      cronometer_nutrition_logs: {
        Row: {
          calories: number
          carbs_g: number
          client_id: string
          created_at: string
          entries: Json
          fat_g: number
          fiber_g: number
          id: string
          log_date: string
          protein_g: number
          sodium_mg: number
          source: string
          sugar_g: number
          synced_at: string
          updated_at: string
        }
        Insert: {
          calories?: number
          carbs_g?: number
          client_id: string
          created_at?: string
          entries?: Json
          fat_g?: number
          fiber_g?: number
          id?: string
          log_date: string
          protein_g?: number
          sodium_mg?: number
          source?: string
          sugar_g?: number
          synced_at?: string
          updated_at?: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          client_id?: string
          created_at?: string
          entries?: Json
          fat_g?: number
          fiber_g?: number
          id?: string
          log_date?: string
          protein_g?: number
          sodium_mg?: number
          source?: string
          sugar_g?: number
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cronometer_sessions: {
        Row: {
          client_id: string
          connected_at: string
          cookies: Json
          created_at: string
          cronometer_username: string | null
          gwt_header: string
          gwt_permutation: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          target_sync_enabled: boolean
          updated_at: string
          user_id_external: string
        }
        Insert: {
          client_id: string
          connected_at?: string
          cookies: Json
          created_at?: string
          cronometer_username?: string | null
          gwt_header: string
          gwt_permutation: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          target_sync_enabled?: boolean
          updated_at?: string
          user_id_external: string
        }
        Update: {
          client_id?: string
          connected_at?: string
          cookies?: Json
          created_at?: string
          cronometer_username?: string | null
          gwt_header?: string
          gwt_permutation?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          target_sync_enabled?: boolean
          updated_at?: string
          user_id_external?: string
        }
        Relationships: []
      }
      cronometer_target_pushes: {
        Row: {
          calories: number | null
          carbs_g: number | null
          client_id: string
          coach_id: string | null
          error: string | null
          fat_g: number | null
          id: string
          protein_g: number | null
          pushed_at: string
          success: boolean
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          client_id: string
          coach_id?: string | null
          error?: string | null
          fat_g?: number | null
          id?: string
          protein_g?: number | null
          pushed_at?: string
          success?: boolean
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          client_id?: string
          coach_id?: string | null
          error?: string | null
          fat_g?: number | null
          id?: string
          protein_g?: number | null
          pushed_at?: string
          success?: boolean
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          coach_id: string
          created_at: string
          header_image_url: string | null
          id: string
          subject: string
          template_key: string
          updated_at: string
        }
        Insert: {
          body?: string
          coach_id: string
          created_at?: string
          header_image_url?: string | null
          id?: string
          subject?: string
          template_key: string
          updated_at?: string
        }
        Update: {
          body?: string
          coach_id?: string
          created_at?: string
          header_image_url?: string | null
          id?: string
          subject?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          created_at: string
          equipment: string | null
          exercise_type: string
          id: string
          is_pro: boolean
          muscle_group: string | null
          name: string
          notes: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          equipment?: string | null
          exercise_type?: string
          id?: string
          is_pro?: boolean
          muscle_group?: string | null
          name: string
          notes?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          equipment?: string | null
          exercise_type?: string
          id?: string
          is_pro?: boolean
          muscle_group?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          coach_id: string
          coaching_end_date: string | null
          coaching_start_date: string | null
          created_at: string
          email: string
          id: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          coach_id: string
          coaching_end_date?: string | null
          coaching_start_date?: string | null
          created_at?: string
          email: string
          id?: string
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          coach_id?: string
          coaching_end_date?: string | null
          coaching_start_date?: string | null
          created_at?: string
          email?: string
          id?: string
          status?: string
          token?: string
        }
        Relationships: []
      }
      mfp_sessions: {
        Row: {
          cookies: string
          created_at: string
          id: string
          mfp_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cookies: string
          created_at?: string
          id?: string
          mfp_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cookies?: string
          created_at?: string
          id?: string
          mfp_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_plans: {
        Row: {
          age: number | null
          client_id: string
          coach_id: string
          completed_at: string | null
          created_at: string
          details: Json
          gender: string | null
          height_cm: number | null
          id: string
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          age?: number | null
          client_id: string
          coach_id: string
          completed_at?: string | null
          created_at?: string
          details?: Json
          gender?: string | null
          height_cm?: number | null
          id?: string
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          age?: number | null
          client_id?: string
          coach_id?: string
          completed_at?: string | null
          created_at?: string
          details?: Json
          gender?: string | null
          height_cm?: number | null
          id?: string
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          coach_id: string
          created_at: string
          state: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          state: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          state?: string
        }
        Relationships: []
      }
      onboarding_responses: {
        Row: {
          activity_level: string | null
          age: number | null
          belly_cm: number | null
          body_fat_pct: number | null
          challenges: string[] | null
          coach_expectations: string | null
          completed_at: string | null
          created_at: string
          details: Json
          diet_preferences: string | null
          drinks_alcohol: string | null
          equipment_brands: string[] | null
          focus_muscles: string[] | null
          follows_meal_plan: boolean | null
          full_name: string | null
          goal_reason: string | null
          height_cm: number | null
          hips_cm: number | null
          id: string
          injuries: string | null
          lifting_since: string | null
          meals_per_day: number | null
          occupation: string | null
          past_failures: string | null
          photo_consent: string | null
          primary_goal: string | null
          progress_photo_back_path: string | null
          progress_photo_front_path: string | null
          progress_photo_side_path: string | null
          sleep_hours: number | null
          smokes: string | null
          step_tracker_screenshot_path: string | null
          supplements: string | null
          target_outcome: string | null
          tracks_macros: boolean | null
          train_days: string[] | null
          train_freq_current: number | null
          train_freq_target: number | null
          train_location: string | null
          train_location_other: string | null
          typical_day_food: string | null
          updated_at: string
          user_id: string
          waist_cm: number | null
          water_liters: number | null
          weekly_training_hours: number | null
          weeks_committed: number | null
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          belly_cm?: number | null
          body_fat_pct?: number | null
          challenges?: string[] | null
          coach_expectations?: string | null
          completed_at?: string | null
          created_at?: string
          details?: Json
          diet_preferences?: string | null
          drinks_alcohol?: string | null
          equipment_brands?: string[] | null
          focus_muscles?: string[] | null
          follows_meal_plan?: boolean | null
          full_name?: string | null
          goal_reason?: string | null
          height_cm?: number | null
          hips_cm?: number | null
          id?: string
          injuries?: string | null
          lifting_since?: string | null
          meals_per_day?: number | null
          occupation?: string | null
          past_failures?: string | null
          photo_consent?: string | null
          primary_goal?: string | null
          progress_photo_back_path?: string | null
          progress_photo_front_path?: string | null
          progress_photo_side_path?: string | null
          sleep_hours?: number | null
          smokes?: string | null
          step_tracker_screenshot_path?: string | null
          supplements?: string | null
          target_outcome?: string | null
          tracks_macros?: boolean | null
          train_days?: string[] | null
          train_freq_current?: number | null
          train_freq_target?: number | null
          train_location?: string | null
          train_location_other?: string | null
          typical_day_food?: string | null
          updated_at?: string
          user_id: string
          waist_cm?: number | null
          water_liters?: number | null
          weekly_training_hours?: number | null
          weeks_committed?: number | null
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          belly_cm?: number | null
          body_fat_pct?: number | null
          challenges?: string[] | null
          coach_expectations?: string | null
          completed_at?: string | null
          created_at?: string
          details?: Json
          diet_preferences?: string | null
          drinks_alcohol?: string | null
          equipment_brands?: string[] | null
          focus_muscles?: string[] | null
          follows_meal_plan?: boolean | null
          full_name?: string | null
          goal_reason?: string | null
          height_cm?: number | null
          hips_cm?: number | null
          id?: string
          injuries?: string | null
          lifting_since?: string | null
          meals_per_day?: number | null
          occupation?: string | null
          past_failures?: string | null
          photo_consent?: string | null
          primary_goal?: string | null
          progress_photo_back_path?: string | null
          progress_photo_front_path?: string | null
          progress_photo_side_path?: string | null
          sleep_hours?: number | null
          smokes?: string | null
          step_tracker_screenshot_path?: string | null
          supplements?: string | null
          target_outcome?: string | null
          tracks_macros?: boolean | null
          train_days?: string[] | null
          train_freq_current?: number | null
          train_freq_target?: number | null
          train_location?: string | null
          train_location_other?: string | null
          typical_day_food?: string | null
          updated_at?: string
          user_id?: string
          waist_cm?: number | null
          water_liters?: number | null
          weekly_training_hours?: number | null
          weeks_committed?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      progress_photos: {
        Row: {
          back_path: string | null
          client_id: string
          created_at: string
          front_path: string | null
          id: string
          notes: string | null
          side_path: string | null
          taken_on: string
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          back_path?: string | null
          client_id: string
          created_at?: string
          front_path?: string | null
          id?: string
          notes?: string | null
          side_path?: string | null
          taken_on?: string
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          back_path?: string | null
          client_id?: string
          created_at?: string
          front_path?: string | null
          id?: string
          notes?: string | null
          side_path?: string | null
          taken_on?: string
          updated_at?: string
          weight_kg?: number | null
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
      weekly_checkins: {
        Row: {
          body_fat_pct: number | null
          client_id: string
          cravings: string | null
          created_at: string
          details: Json
          energy: number | null
          feeling: number | null
          hydration: number | null
          id: string
          intensity_rpe: number | null
          measurements: string | null
          nutrition_deviations: string | null
          nutrition_stars: number | null
          obstacles: string | null
          other_notes: string | null
          progress_feeling: string | null
          progression: number | null
          sleep_cycle: string | null
          sleep_cycle_other: string | null
          soreness: number | null
          structure_planning: string | null
          submitted_at: string
          supplements_consistency: number | null
          training_count: string | null
          training_count_other: string | null
          updated_at: string
          week_start: string
          weight_kg: number | null
        }
        Insert: {
          body_fat_pct?: number | null
          client_id: string
          cravings?: string | null
          created_at?: string
          details?: Json
          energy?: number | null
          feeling?: number | null
          hydration?: number | null
          id?: string
          intensity_rpe?: number | null
          measurements?: string | null
          nutrition_deviations?: string | null
          nutrition_stars?: number | null
          obstacles?: string | null
          other_notes?: string | null
          progress_feeling?: string | null
          progression?: number | null
          sleep_cycle?: string | null
          sleep_cycle_other?: string | null
          soreness?: number | null
          structure_planning?: string | null
          submitted_at?: string
          supplements_consistency?: number | null
          training_count?: string | null
          training_count_other?: string | null
          updated_at?: string
          week_start: string
          weight_kg?: number | null
        }
        Update: {
          body_fat_pct?: number | null
          client_id?: string
          cravings?: string | null
          created_at?: string
          details?: Json
          energy?: number | null
          feeling?: number | null
          hydration?: number | null
          id?: string
          intensity_rpe?: number | null
          measurements?: string | null
          nutrition_deviations?: string | null
          nutrition_stars?: number | null
          obstacles?: string | null
          other_notes?: string | null
          progress_feeling?: string | null
          progression?: number | null
          sleep_cycle?: string | null
          sleep_cycle_other?: string | null
          soreness?: number | null
          structure_planning?: string | null
          submitted_at?: string
          supplements_consistency?: number | null
          training_count?: string | null
          training_count_other?: string | null
          updated_at?: string
          week_start?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      weekly_review_drafts: {
        Row: {
          applied_to_nutrition_at: string | null
          checkin_id: string | null
          client_actions: string[]
          client_attention: string[]
          client_id: string
          client_positive: string[]
          coach_id: string
          created_at: string
          generated_at: string | null
          id: string
          insights: Json
          published_at: string | null
          suggested_adjustments: Json
          updated_at: string
          voice_memo: string
          voice_memo_recorded_at: string | null
          week_start: string
        }
        Insert: {
          applied_to_nutrition_at?: string | null
          checkin_id?: string | null
          client_actions?: string[]
          client_attention?: string[]
          client_id: string
          client_positive?: string[]
          coach_id: string
          created_at?: string
          generated_at?: string | null
          id?: string
          insights?: Json
          published_at?: string | null
          suggested_adjustments?: Json
          updated_at?: string
          voice_memo?: string
          voice_memo_recorded_at?: string | null
          week_start: string
        }
        Update: {
          applied_to_nutrition_at?: string | null
          checkin_id?: string | null
          client_actions?: string[]
          client_attention?: string[]
          client_id?: string
          client_positive?: string[]
          coach_id?: string
          created_at?: string
          generated_at?: string | null
          id?: string
          insights?: Json
          published_at?: string | null
          suggested_adjustments?: Json
          updated_at?: string
          voice_memo?: string
          voice_memo_recorded_at?: string | null
          week_start?: string
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          client_id: string
          created_at: string
          id: string
          logged_on: string
          note: string | null
          updated_at: string
          weight_kg: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          logged_on?: string
          note?: string | null
          updated_at?: string
          weight_kg: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          logged_on?: string
          note?: string | null
          updated_at?: string
          weight_kg?: number
        }
        Relationships: []
      }
      workout_plan_days: {
        Row: {
          created_at: string
          day_index: number
          id: string
          name: string
          plan_id: string
        }
        Insert: {
          created_at?: string
          day_index: number
          id?: string
          name: string
          plan_id: string
        }
        Update: {
          created_at?: string
          day_index?: number
          id?: string
          name?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_plan_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plan_exercises: {
        Row: {
          created_at: string
          day_id: string
          exercise_id: string
          id: string
          notes: string | null
          order_index: number
          sets_reps: string | null
        }
        Insert: {
          created_at?: string
          day_id: string
          exercise_id: string
          id?: string
          notes?: string | null
          order_index: number
          sets_reps?: string | null
        }
        Update: {
          created_at?: string
          day_id?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          order_index?: number
          sets_reps?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_plan_exercises_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "workout_plan_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plan_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          category: string | null
          coach_id: string | null
          created_at: string
          description: string | null
          frequency_per_week: number | null
          id: string
          is_template: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          coach_id?: string | null
          created_at?: string
          description?: string | null
          frequency_per_week?: number | null
          id?: string
          is_template?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          coach_id?: string | null
          created_at?: string
          description?: string | null
          frequency_per_week?: number | null
          id?: string
          is_template?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      workout_sessions: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          day_id: string | null
          id: string
          notes: string | null
          plan_id: string
          scheduled_date: string | null
          started_at: string
          updated_at: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          day_id?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          scheduled_date?: string | null
          started_at?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          day_id?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          scheduled_date?: string | null
          started_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workout_set_logs: {
        Row: {
          created_at: string
          distance_m: number | null
          duration_seconds: number | null
          id: string
          incline_pct: number | null
          intensity: string | null
          notes: string | null
          plan_exercise_id: string
          reps: number | null
          session_id: string
          set_number: number
          speed_kmh: number | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          distance_m?: number | null
          duration_seconds?: number | null
          id?: string
          incline_pct?: number | null
          intensity?: string | null
          notes?: string | null
          plan_exercise_id: string
          reps?: number | null
          session_id: string
          set_number: number
          speed_kmh?: number | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          distance_m?: number | null
          duration_seconds?: number | null
          id?: string
          incline_pct?: number | null
          intensity?: string | null
          notes?: string | null
          plan_exercise_id?: string
          reps?: number | null
          session_id?: string
          set_number?: number
          speed_kmh?: number | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_set_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_clients_last_active: {
        Args: { _coach_id: string }
        Returns: {
          last_sign_in_at: string
          user_id: string
        }[]
      }
      get_invitation_by_token: {
        Args: { _token: string }
        Returns: {
          email: string
          id: string
          status: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_coach_of: {
        Args: { _client_id: string; _coach_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "coach"
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
      app_role: ["user", "coach"],
    },
  },
} as const
