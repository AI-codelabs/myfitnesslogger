import type { DiaryDayPayload, MealFood, MealGroup, MealMacros } from "@/lib/nutritionDiary";

export type { MealFood, MealGroup, MealMacros, DiaryDayPayload };

export interface CronometerEntry {
  name: string;
  amount: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  sugar: number;
  sodium: number;
  fiber: number;
  group: string;
  category: string;
}

export interface DayLog {
  date: string;
  entries: CronometerEntry[];
  /** Preferred rich meal payload from Pro diary_summary sync. */
  diary?: DiaryDayPayload;
  totals: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
    sugar: number;
    sodium: number;
    fiber: number;
  };
}

export interface CronometerExportData {
  success: boolean;
  days: DayLog[];
  headers?: string[];
  error?: string;
}
