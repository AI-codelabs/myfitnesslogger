// Fire-and-forget push of in-app targets into the client's Cronometer account.
// Silently no-ops if the coach hasn't connected target sync for this client.
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
  skipped?: "not_connected" | "unchanged" | "needs_reauth";
  error?: string;
}> {
  const { data, error } = await pushCronometerTargets(args.client_id);
  if (error) {
    if (error === "not_connected") return { success: false, skipped: "not_connected" };
    if (error === "needs_reauth") return { success: false, skipped: "needs_reauth" };
    return { success: false, error };
  }
  if ((data as any)?.skipped === "unchanged") return { success: true, skipped: "unchanged" };
  return { success: true };
}
