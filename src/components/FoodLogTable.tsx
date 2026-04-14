import type { DayLog } from "@/types/cronometer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FoodLogTableProps {
  days: DayLog[];
}

export const FoodLogTable = ({ days }: FoodLogTableProps) => {
  return (
    <div className="space-y-6">
      {days.map((day) => (
        <div key={day.date} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border gradient-brand-subtle">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold tracking-tight">{day.date}</h3>
              <span className="text-sm text-muted-foreground">
                {day.totals.calories} cal
              </span>
            </div>
          </div>

          {day.entries.length === 0 ? (
            <div className="px-5 py-4 text-sm text-muted-foreground italic">
              No entries logged
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[35%]">Food</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-right">Cal</TableHead>
                  <TableHead className="text-right">Protein</TableHead>
                  <TableHead className="text-right">Carbs</TableHead>
                  <TableHead className="text-right">Fat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {day.entries.map((entry, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium text-sm">
                      {entry.name}
                      {entry.group && (
                        <span className="text-muted-foreground text-xs ml-1.5">({entry.group})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.amount}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(entry.calories)}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.protein.toFixed(1)}g</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.carbohydrates.toFixed(1)}g</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.fat.toFixed(1)}g</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={2}>Daily Total</TableCell>
                  <TableCell className="text-right tabular-nums">{day.totals.calories}</TableCell>
                  <TableCell className="text-right tabular-nums">{day.totals.protein}g</TableCell>
                  <TableCell className="text-right tabular-nums">{day.totals.carbohydrates}g</TableCell>
                  <TableCell className="text-right tabular-nums">{day.totals.fat}g</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
      ))}

      {/* Weekly summary */}
      {days.length > 1 && (
        <div className="rounded-xl border-2 border-primary/30 bg-card overflow-hidden">
          <div className="px-5 py-4 gradient-brand">
            <div className="flex items-center justify-between text-primary-foreground">
              <h3 className="font-bold text-lg">7-Day Summary</h3>
              <span className="text-lg font-bold">
                {Math.round(days.reduce((s, d) => s + d.totals.calories, 0) / days.length)} avg cal/day
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-border">
            {[
              { label: "Avg Protein", value: `${(days.reduce((s, d) => s + d.totals.protein, 0) / days.length).toFixed(0)}g` },
              { label: "Avg Carbs", value: `${(days.reduce((s, d) => s + d.totals.carbohydrates, 0) / days.length).toFixed(0)}g` },
              { label: "Avg Fat", value: `${(days.reduce((s, d) => s + d.totals.fat, 0) / days.length).toFixed(0)}g` },
              { label: "Avg Fiber", value: `${(days.reduce((s, d) => s + d.totals.fiber, 0) / days.length).toFixed(0)}g` },
            ].map((item) => (
              <div key={item.label} className="px-4 py-4 text-center">
                <div className="text-lg font-bold tabular-nums">{item.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
