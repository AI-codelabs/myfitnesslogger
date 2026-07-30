/** Shared Cronometer diary shapes + parsers for coach/client nutrition UI. */

export interface MealMacros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  net_carbs_g?: number;
  alcohol_g?: number;
  magnesium_mg?: number;
  potassium_mg?: number;
}

export interface MealFood {
  name: string;
  serving?: string;
}

export interface MealGroup {
  name: string;
  foods: MealFood[];
  macros: MealMacros;
}

export interface DiaryDayPayload {
  version: 2;
  completed?: boolean;
  food_grams?: number;
  meals: MealGroup[];
  /** Full Cronometer micronutrient map (name → amount). */
  nutrients?: Record<string, number>;
  /** Day-level extras beyond the scalar DB columns. */
  extras?: MealMacros;
}

export type DiaryEntriesRaw = DiaryDayPayload | LegacyFlatEntry[] | null | undefined;

/** Legacy flat food rows (pre meal-group sync). */
export interface LegacyFlatEntry {
  name?: string;
  amount?: string;
  serving?: string;
  group?: string;
  category?: string;
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function num(...vals: unknown[]): number {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

/** Map Cronometer macros object → MealMacros. */
export function macrosFromCrono(raw: Record<string, unknown> | null | undefined): MealMacros {
  if (!raw || typeof raw !== "object") {
    return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  }
  const lower = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const v = raw[key] ?? lower[key.toLowerCase()];
      if (v !== undefined && v !== null && v !== "") return Number(v) || 0;
    }
    return 0;
  };
  return {
    calories: pick("kcal", "calories", "energy", "energy_kcal"),
    protein_g: pick("protein", "protein_g"),
    carbs_g: pick("total_carbs", "carbs", "carbohydrates", "carbohydrates_g"),
    fat_g: pick("fat", "fat_g"),
    fiber_g: pick("fiber", "fiber_g"),
    sugar_g: pick("sugars", "sugar", "sugar_g"),
    sodium_mg: pick("sodium", "sodium_mg"),
    net_carbs_g: pick("net_carbs", "net carbs"),
    alcohol_g: pick("alcohol"),
    magnesium_mg: pick("magnesium"),
    potassium_mg: pick("potassium"),
  };
}

function isDiaryDayPayload(v: unknown): v is DiaryDayPayload {
  return !!v && typeof v === "object" && !Array.isArray(v) && (v as DiaryDayPayload).version === 2;
}

/** Detect raw Cronometer diary_summary `foods` meal-group array. */
function isCronoMealGroups(v: unknown): v is Array<Record<string, unknown>> {
  if (!Array.isArray(v) || v.length === 0) return false;
  const first = v[0];
  return (
    !!first &&
    typeof first === "object" &&
    Array.isArray((first as { foods?: unknown }).foods) &&
    typeof (first as { name?: unknown }).name === "string"
  );
}

function flattenLegacy(entries: LegacyFlatEntry[]): MealGroup[] {
  const map = new Map<string, MealGroup>();
  for (const e of entries) {
    const groupName = (e.group || e.category || "Other").trim() || "Other";
    if (!map.has(groupName)) {
      map.set(groupName, {
        name: groupName,
        foods: [],
        macros: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      });
    }
    const g = map.get(groupName)!;
    g.foods.push({
      name: e.name || "—",
      serving: e.amount || e.serving || undefined,
    });
    g.macros.calories += num(e.calories);
    g.macros.protein_g += num(e.protein);
    g.macros.carbs_g += num(e.carbohydrates, e.carbs);
    g.macros.fat_g += num(e.fat);
    g.macros.fiber_g = (g.macros.fiber_g ?? 0) + num(e.fiber);
    g.macros.sugar_g = (g.macros.sugar_g ?? 0) + num(e.sugar);
    g.macros.sodium_mg = (g.macros.sodium_mg ?? 0) + num(e.sodium);
  }
  return Array.from(map.values());
}

function fromCronoMealGroups(groups: Array<Record<string, unknown>>): MealGroup[] {
  return groups.map((g) => {
    const foodsRaw = Array.isArray(g.foods) ? g.foods : [];
    return {
      name: String(g.name || "Other"),
      foods: foodsRaw.map((f) => {
        const row = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
        return {
          name: String(row.name ?? "—"),
          serving: row.serving != null ? String(row.serving) : undefined,
        };
      }),
      macros: macrosFromCrono(
        (g.macros && typeof g.macros === "object" ? g.macros : {}) as Record<string, unknown>,
      ),
    };
  });
}

/**
 * Normalize anything stored in `cronometer_nutrition_logs.entries`
 * (v2 payload, legacy flat list, or raw Cronometer foods[]) into MealGroup[].
 */
export function parseMealsFromEntries(raw: DiaryEntriesRaw): {
  meals: MealGroup[];
  completed?: boolean;
  nutrients?: Record<string, number>;
  food_grams?: number;
} {
  if (!raw) return { meals: [] };

  if (isDiaryDayPayload(raw)) {
    return {
      meals: raw.meals ?? [],
      completed: raw.completed,
      nutrients: raw.nutrients,
      food_grams: raw.food_grams,
    };
  }

  if (isCronoMealGroups(raw)) {
    return { meals: fromCronoMealGroups(raw) };
  }

  if (Array.isArray(raw)) {
    // Could be legacy flat entries OR wrapped as {name,foods} without version
    if (isCronoMealGroups(raw)) return { meals: fromCronoMealGroups(raw) };
    return { meals: flattenLegacy(raw as LegacyFlatEntry[]) };
  }

  // Object without version — try foods / meals keys
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.meals) && isCronoMealGroups(obj.meals)) {
      return {
        meals: fromCronoMealGroups(obj.meals as Array<Record<string, unknown>>),
        completed: !!obj.completed,
        nutrients: (obj.nutrients as Record<string, number>) || undefined,
        food_grams: obj.food_grams != null ? Number(obj.food_grams) : undefined,
      };
    }
    if (Array.isArray(obj.foods) && isCronoMealGroups(obj.foods)) {
      return {
        meals: fromCronoMealGroups(obj.foods as Array<Record<string, unknown>>),
        completed: !!obj.completed,
        nutrients: (obj.nutrients as Record<string, number>) || undefined,
        food_grams: obj.food_grams != null ? Number(obj.food_grams) : undefined,
      };
    }
  }

  return { meals: [] };
}

/** Build the v2 entries payload stored in DB from a Cronometer diary_summary response. */
export function buildDiaryEntriesPayload(payload: Record<string, unknown>): DiaryDayPayload {
  const foods = payload.foods;
  let meals: MealGroup[] = [];
  if (isCronoMealGroups(foods)) {
    meals = fromCronoMealGroups(foods);
  } else if (Array.isArray(payload.entries)) {
    meals = flattenLegacy(payload.entries as LegacyFlatEntry[]);
  } else if (Array.isArray(payload.servings)) {
    meals = flattenLegacy(payload.servings as LegacyFlatEntry[]);
  }

  const nutrientsRaw =
    payload.nutrients && typeof payload.nutrients === "object"
      ? (payload.nutrients as Record<string, unknown>)
      : {};
  const nutrients: Record<string, number> = {};
  for (const [k, v] of Object.entries(nutrientsRaw)) {
    const n = Number(v);
    if (!Number.isNaN(n)) nutrients[k] = n;
  }

  const extras = macrosFromCrono(
    (payload.macros && typeof payload.macros === "object"
      ? payload.macros
      : payload.totals && typeof payload.totals === "object"
        ? payload.totals
        : {}) as Record<string, unknown>,
  );

  return {
    version: 2,
    completed: payload.completed === true,
    food_grams: payload.food_grams != null ? Number(payload.food_grams) || undefined : undefined,
    meals,
    nutrients: Object.keys(nutrients).length ? nutrients : undefined,
    extras,
  };
}

export const MEAL_ORDER_EN = ["Breakfast", "Lunch", "Dinner", "Snacks", "Snack"];
export const MEAL_ORDER_NL = ["Ontbijt", "Lunch", "Diner", "Snacks", "Snack"];

export function translateMealName(name: string, lang: "nl" | "en"): string {
  if (lang !== "nl") return name;
  const map: Record<string, string> = {
    Breakfast: "Ontbijt",
    Lunch: "Lunch",
    Dinner: "Diner",
    Snacks: "Snacks",
    Snack: "Snack",
  };
  return map[name] ?? name;
}

export function sortMeals(meals: MealGroup[], lang: "nl" | "en"): MealGroup[] {
  const order = lang === "nl" ? MEAL_ORDER_NL : MEAL_ORDER_EN;
  return [...meals].sort((a, b) => {
    const an = translateMealName(a.name, lang);
    const bn = translateMealName(b.name, lang);
    const ia = order.indexOf(an);
    const ib = order.indexOf(bn);
    if (ia === -1 && ib === -1) return an.localeCompare(bn);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/** Curated micronutrient groups for UI (keys match Cronometer nutrient names). */
export const NUTRIENT_GROUPS: { id: string; nl: string; en: string; keys: string[] }[] = [
  {
    id: "macros_ext",
    nl: "Extra macro's",
    en: "Extra macros",
    keys: ["Fiber", "Net Carbs", "Sugars", "Alcohol", "Water", "Cholesterol", "Saturated", "Monounsaturated", "Polyunsaturated", "Trans-Fats"],
  },
  {
    id: "vitamins",
    nl: "Vitaminen",
    en: "Vitamins",
    keys: [
      "Vitamin A", "Retinol Activity Equivalent", "Retinol", "Beta-carotene",
      "Vitamin C", "Vitamin D", "Vitamin E", "Vitamin K",
      "B1 (Thiamine)", "B2 (Riboflavin)", "B3 (Niacin)", "B5 (Pantothenic Acid)",
      "B6 (Pyridoxine)", "B12 (Cobalamin)", "Folate", "Choline",
    ],
  },
  {
    id: "minerals",
    nl: "Mineralen",
    en: "Minerals",
    keys: [
      "Calcium", "Iron", "Magnesium", "Phosphorus", "Potassium", "Sodium",
      "Zinc", "Copper", "Manganese", "Selenium",
    ],
  },
  {
    id: "amino",
    nl: "Aminozuren",
    en: "Amino acids",
    keys: [
      "Histidine", "Isoleucine", "Leucine", "Lysine", "Methionine",
      "Phenylalanine", "Threonine", "Tryptophan", "Valine",
      "Alanine", "Arginine", "Aspartic acid", "Cystine", "Glutamic acid",
      "Glycine", "Proline", "Serine", "Tyrosine",
    ],
  },
];

export function nutrientUnit(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("energy") || k === "calories") return "kcal";
  if (
    k.includes("vitamin d") ||
    k.includes("vitamin a") ||
    k.includes("retinol") ||
    k.includes("carotene") ||
    k.includes("lutein") ||
    k.includes("lycopene") ||
    k.includes("folate") ||
    k.includes("b12")
  ) {
    return "µg";
  }
  if (k.includes("vitamin") || k.includes("b1") || k.includes("b2") || k.includes("b3") || k.includes("b5") || k.includes("b6") || k.includes("choline") || k.includes("iron") || k.includes("zinc") || k.includes("copper") || k.includes("manganese") || k.includes("selenium")) {
    return "mg";
  }
  if (k.includes("sodium") || k.includes("potassium") || k.includes("calcium") || k.includes("magnesium") || k.includes("phosphorus") || k.includes("cholesterol") || k.includes("caffeine")) {
    return "mg";
  }
  if (k.includes("water")) return "g";
  return "g";
}

export function formatNutrientValue(key: string, value: number): string {
  const abs = Math.abs(value);
  const rounded = abs >= 100 ? Math.round(value) : abs >= 10 ? round1(value) : Math.round(value * 100) / 100;
  return `${rounded} ${nutrientUnit(key)}`;
}
