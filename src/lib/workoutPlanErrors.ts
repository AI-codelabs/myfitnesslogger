const WORKOUT_PLAN_RLS_MESSAGE =
  "You can only edit workout templates you own. Create an editable template copy first, then make your changes there.";

export function formatWorkoutPlanMutationError(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : (error as { message?: string } | null)?.message ?? "";

  if (
    /row-level security/i.test(message) ||
    /violates row-level security policy/i.test(message)
  ) {
    return WORKOUT_PLAN_RLS_MESSAGE;
  }

  return message || "Could not save the workout plan change. Please try again.";
}

