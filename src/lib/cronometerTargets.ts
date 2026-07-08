// Legacy shim. Cronometer's official API has no write endpoint for targets,
// so we no longer push targets to Cronometer. Targets live in this app
// (see nutrition_plans) and are shown to the client in the Nutrition tab.
//
// Existing callers (NutritionWizard, WeeklyReviewTab) fire-and-forget this
// helper; returning a benign "skipped" result keeps them working until
// Phase 4 removes the calls entirely.

export interface PushTargetsArgs {
  client_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export async function pushTargetsToCronometer(_args: PushTargetsArgs): Promise<{
  success: boolean;
  skipped?: "no_session" | "sync_disabled";
  error?: string;
}> {
  return { success: false, skipped: "sync_disabled" };
}
