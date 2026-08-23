// Push in-app nutrition targets into the client's Cronometer account via the coach Pro session.
// No-ops when the client is not linked in Cronometer Pro yet.
import { pushCronometerTargets } from "./cronometerTargetsWeb";

export interface PushTargetsArgs {
  client_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export async function pushTargetsToCronometer(args: PushTargetsArgs): Promise<{
  success: boolean;
  skipped?: "not_connected" | "unchanged";
  error?: string;
}> {
  const { data, error } = await pushCronometerTargets(args.client_id);
  if (error) {
    if (error === "not_connected") return { success: false, skipped: "not_connected" };
    return { success: false, error };
  }
  if ((data as any)?.skipped === "unchanged") return { success: true, skipped: "unchanged" };
  return { success: true };
}
