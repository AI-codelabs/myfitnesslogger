export interface FoodEntry {
  name: string;
  brand?: string;
  calories: number;
  carbohydrates: number;
  fat: number;
  protein: number;
  sodium: number;
  sugar: number;
  servings?: number;
}

export interface Meal {
  name: string;
  entries: FoodEntry[];
  totals: Omit<FoodEntry, "name" | "brand" | "servings">;
}

export interface FoodLogData {
  date: string;
  meals: Meal[];
  totals: Omit<FoodEntry, "name" | "brand" | "servings">;
}
