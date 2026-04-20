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
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          coach_id: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
