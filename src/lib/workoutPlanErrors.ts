const WORKOUT_PLAN_RLS_MESSAGE =
  "You can't edit this shared workout template directly. Duplicate the template first, then edit your own copy.";

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

