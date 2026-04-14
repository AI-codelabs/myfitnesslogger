export interface FoodEntry {
  name: string;
  calories: number;
  carbohydrates: number;
  fat: number;
  protein: number;
  sodium: number;
  sugar: number;
}

export interface Meal {
  name: string;
  entries: FoodEntry[];
  totals: Omit<FoodEntry, "name">;
}

export interface FoodLogData {
  date: string;
  meals: Meal[];
  totals: Omit<FoodEntry, "name">;
}
