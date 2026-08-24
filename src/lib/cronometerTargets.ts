// Push in-app nutrition targets into the client's Cronometer account via the coach Pro session.
// No-ops when the client is not linked in Cronometer Pro yet.
import { pushCronometerTargets } from "./cronometerTargetsWeb";

/** Success copy after a Cronometer target push (custom eating target vs expenditure). */
export const cronometerPushSuccessCopy = (nl: boolean) =>
  nl
    ? "Doelen zijn volledig bijgewerkt in Cronometer en staan als Custom Energy Target. Energy expenditure (verbruik) kan een ander getal tonen door BMR en basisactiviteit — ook op dagen zonder training. Dat is geen extra eetdoel."
    : "Targets are fully updated in Cronometer and visible as the Custom Energy Target. Energy expenditure (calories burned) can show a different number based on BMR and baseline activity — including days with no workouts. That is not a second eating target.";

export const cronometerExpenditureNote = (nl: boolean) =>
  nl
    ? "Cronometer's Energy-overzicht (verbruik) kan hoger zijn dan dit eetdoel. Dat komt door BMR + basisactiviteit (Sedentary) en geldt ook voor toekomstige dagen zonder logging. Controleer Custom Energy Target / Remaining — daar staat het gepushte doel."
    : "Cronometer's energy expenditure (burned) can be higher than this eating target. That comes from BMR + baseline activity (Sedentary) and also appears on future days with no logged activity. Check Custom Energy Target / Remaining — that is the pushed target.";

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
