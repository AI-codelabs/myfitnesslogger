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
