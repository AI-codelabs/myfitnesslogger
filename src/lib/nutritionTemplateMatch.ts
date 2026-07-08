// Rank nutrition plan templates against a client's macro targets.
// Uses normalized Euclidean distance across (kcal, protein, carbs, fat).

export interface TemplateMacros {
  id: string;
  name: string;
  goal_type: "cut" | "bulk" | "maintain";
  target_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface ClientTargets {
  goal_type?: "cut" | "bulk" | "maintain" | "custom" | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface RankedTemplate<T extends TemplateMacros> {
  template: T;
  score: number; // lower = closer match
}

export function rankTemplates<T extends TemplateMacros>(
  templates: T[],
  targets: ClientTargets,
): RankedTemplate<T>[] {
  // Filter by goal if provided (fall back to all when goal is 'custom' or missing)
  const goalFiltered =
    targets.goal_type && targets.goal_type !== "custom"
      ? templates.filter((t) => t.goal_type === targets.goal_type)
      : templates;

  const pool = goalFiltered.length ? goalFiltered : templates;

  // Normalize by target magnitude so kcal doesn't dominate g values.
  const norm = {
    kcal: Math.max(targets.calories, 1),
    p: Math.max(targets.protein_g, 1),
    c: Math.max(targets.carbs_g, 1),
    f: Math.max(targets.fat_g, 1),
  };

  return pool
    .map((t) => {
      const d =
        Math.pow((t.target_kcal - targets.calories) / norm.kcal, 2) +
        Math.pow((t.protein_g - targets.protein_g) / norm.p, 2) +
        Math.pow((t.carbs_g - targets.carbs_g) / norm.c, 2) +
        Math.pow((t.fat_g - targets.fat_g) / norm.f, 2);
      return { template: t, score: Math.sqrt(d) };
    })
    .sort((a, b) => a.score - b.score);
}
