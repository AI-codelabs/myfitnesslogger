// Shared types + helpers for structured (editable) meal plans.
// Used by nutrition_plan_templates.structure and client_meal_plans.structure.

export interface MealItem {
  id: string;
  product: string; // e.g. "AH Volkoren boterham (5 stuks)"
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  kcal: number;
}

export interface MealOption {
  id: string;
  name: string; // e.g. "Optie 1 – Boterhammen"
  notes?: string;
  items: MealItem[];
}

export interface MealCategory {
  id: string;
  name: string; // editable label, e.g. "Ontbijt"
  options: MealOption[];
}

export interface MealPlanStructure {
  categories: MealCategory[];
}

export const EMPTY_STRUCTURE: MealPlanStructure = { categories: [] };

// tiny id generator that's safe cross-browser
export const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));

export function optionTotals(o: MealOption) {
  return o.items.reduce(
    (acc, i) => ({
      protein_g: acc.protein_g + (Number(i.protein_g) || 0),
      carbs_g: acc.carbs_g + (Number(i.carbs_g) || 0),
      fat_g: acc.fat_g + (Number(i.fat_g) || 0),
      kcal: acc.kcal + (Number(i.kcal) || 0),
    }),
    { protein_g: 0, carbs_g: 0, fat_g: 0, kcal: 0 },
  );
}

// Normalizes anything coming out of the db into a valid MealPlanStructure.
export function coerceStructure(raw: unknown): MealPlanStructure {
  if (!raw || typeof raw !== "object") return { categories: [] };
  const r = raw as { categories?: unknown };
  if (!Array.isArray(r.categories)) return { categories: [] };
  return {
    categories: r.categories.map((c: any) => ({
      id: c?.id || newId(),
      name: String(c?.name || "Untitled"),
      options: Array.isArray(c?.options)
        ? c.options.map((o: any) => ({
            id: o?.id || newId(),
            name: String(o?.name || "Option"),
            notes: o?.notes ? String(o.notes) : undefined,
            items: Array.isArray(o?.items)
              ? o.items.map((i: any) => ({
                  id: i?.id || newId(),
                  product: String(i?.product || ""),
                  protein_g: Number(i?.protein_g) || 0,
                  carbs_g: Number(i?.carbs_g) || 0,
                  fat_g: Number(i?.fat_g) || 0,
                  kcal: Number(i?.kcal) || 0,
                }))
              : [],
          }))
        : [],
    })),
  };
}

export function makeEmptyCategory(name = "New meal"): MealCategory {
  return {
    id: newId(),
    name,
    options: [makeEmptyOption("Option 1")],
  };
}

export function makeEmptyOption(name = "Option"): MealOption {
  return { id: newId(), name, items: [makeEmptyItem()] };
}

export function makeEmptyItem(): MealItem {
  return {
    id: newId(),
    product: "",
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    kcal: 0,
  };
}
