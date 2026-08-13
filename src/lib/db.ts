// Single entry point for table access during the backend migration.
//
// `db.from(table)` returns the Neon-backed query builder for tables whose
// feature group is listed in VITE_NEON_FEATURES, and the legacy client for the
// rest. Call sites are identical for both, so cutover is a flag flip per group.

import { supabase } from "@/integrations/supabase/client";
import { pgFrom } from "@/lib/api/pg";

export const FEATURE_TABLES: Record<string, string[]> = {
  weight: ["weight_logs"],
  checkins: ["weekly_checkins", "weekly_review_drafts"],
  workouts: [
    "exercises",
    "workout_plans",
    "workout_plan_days",
    "workout_plan_exercises",
    "client_workout_assignments",
    "workout_schedule_overrides",
    "workout_sessions",
    "workout_set_logs",
  ],
  nutrition: [
    "client_meal_plans",
    "client_meal_selections",
    "client_nutrition_documents",
    "nutrition_plan_templates",
    "nutrition_plans",
    "cronometer_clients",
    "cronometer_nutrition_logs",
  ],
  clients: [
    "profiles",
    "invitations",
    "notifications",
    "user_roles",
    "coach_messages",
    "onboarding_responses",
    "client_goals",
    "progress_photos",
    "coach_email_connections",
    "email_templates",
  ],
};

const enabledFeatures = new Set(
  (import.meta.env.VITE_NEON_FEATURES ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean),
);

const neonTables = new Set<string>();
for (const feature of Array.from(enabledFeatures) as string[]) {
  for (const table of FEATURE_TABLES[feature] ?? []) neonTables.add(table);
}

export const isNeonTable = (table: string) => neonTables.has(table);
export const isNeonFeature = (feature: string) => enabledFeatures.has(feature);

/* eslint-disable @typescript-eslint/no-explicit-any */
export const db = {
  from(table: string): any {
    return neonTables.has(table) ? pgFrom(table) : (supabase.from as any)(table);
  },
};
