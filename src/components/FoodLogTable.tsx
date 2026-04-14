import type { FoodLogData } from "@/types/mfp";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FoodLogTableProps {
  data: FoodLogData;
}

export const FoodLogTable = ({ data }: FoodLogTableProps) => {
  return (
    <div className="space-y-6">
      {data.meals.map((meal) => (
        <div key={meal.name} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border gradient-brand-subtle">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold tracking-tight">{meal.name}</h3>
              <span className="text-sm text-muted-foreground">
                {meal.totals.calories} cal
              </span>
            </div>
          </div>

          {meal.entries.length === 0 ? (
            <div className="px-5 py-4 text-sm text-muted-foreground italic">
              No entries logged
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40%]">Food</TableHead>
                  <TableHead className="text-right">Cal</TableHead>
                  <TableHead className="text-right">Carbs</TableHead>
                  <TableHead className="text-right">Fat</TableHead>
                  <TableHead className="text-right">Protein</TableHead>
                  <TableHead className="text-right">Sugar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meal.entries.map((entry, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium text-sm">{entry.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.calories}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.carbohydrates}g</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.fat}g</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.protein}g</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.sugar}g</TableCell>
                  </TableRow>
                ))}
                {/* Meal totals row */}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{meal.totals.calories}</TableCell>
                  <TableCell className="text-right tabular-nums">{meal.totals.carbohydrates}g</TableCell>
                  <TableCell className="text-right tabular-nums">{meal.totals.fat}g</TableCell>
                  <TableCell className="text-right tabular-nums">{meal.totals.protein}g</TableCell>
                  <TableCell className="text-right tabular-nums">{meal.totals.sugar}g</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
      ))}

      {/* Daily totals */}
      <div className="rounded-xl border-2 border-primary/30 bg-card overflow-hidden">
        <div className="px-5 py-4 gradient-brand">
          <div className="flex items-center justify-between text-primary-foreground">
            <h3 className="font-bold text-lg">Daily Total</h3>
            <span className="text-lg font-bold">{data.totals.calories} cal</span>
          </div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-border">
          {[
            { label: "Carbs", value: `${data.totals.carbohydrates}g` },
            { label: "Fat", value: `${data.totals.fat}g` },
            { label: "Protein", value: `${data.totals.protein}g` },
            { label: "Sugar", value: `${data.totals.sugar}g` },
          ].map((item) => (
            <div key={item.label} className="px-4 py-4 text-center">
              <div className="text-lg font-bold tabular-nums">{item.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
