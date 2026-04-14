import { useState } from "react";
import type { DayLog } from "@/types/cronometer";
import { ChevronDown, ChevronUp } from "lucide-react";

interface FoodLogTableProps {
  days: DayLog[];
}

/** Mobile-friendly food entry card */
const FoodEntryCard = ({ entry }: { entry: DayLog["entries"][0] }) => (
  <div className="px-4 py-3 border-b border-border/50 last:border-b-0">
    <div className="flex items-start justify-between gap-2 mb-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight truncate">{entry.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.amount}</p>
      </div>
      <span className="text-sm font-semibold tabular-nums flex-shrink-0">{Math.round(entry.calories)} cal</span>
    </div>
    <div className="flex gap-3 text-xs text-muted-foreground">
      <span className="tabular-nums">P {entry.protein.toFixed(1)}g</span>
      <span className="tabular-nums">C {entry.carbohydrates.toFixed(1)}g</span>
      <span className="tabular-nums">F {entry.fat.toFixed(1)}g</span>
    </div>
  </div>
);

/** Collapsible day section */
const DaySection = ({ day }: { day: DayLog }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Day header — tappable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 border-b border-border gradient-brand-subtle flex items-center justify-between active:opacity-80 transition-opacity"
      >
        <h3 className="font-semibold tracking-tight text-sm sm:text-base">{day.date}</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{day.totals.calories} cal</span>
          {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {isOpen && (
        <>
          {day.entries.length === 0 ? (
            <div className="px-4 py-4 text-sm text-muted-foreground italic">
              No entries logged
            </div>
          ) : (
            <>
              {day.entries.map((entry, idx) => (
                <FoodEntryCard key={idx} entry={entry} />
              ))}
              {/* Day totals */}
              <div className="px-4 py-3 bg-muted/50 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold tabular-nums">{day.totals.protein}g</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">Protein</div>
                </div>
                <div>
                  <div className="text-sm font-bold tabular-nums">{day.totals.carbohydrates}g</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">Carbs</div>
                </div>
                <div>
                  <div className="text-sm font-bold tabular-nums">{day.totals.fat}g</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">Fat</div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export const FoodLogTable = ({ days }: FoodLogTableProps) => {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Weekly summary — always visible at top */}
      {days.length > 1 && (
        <div className="rounded-xl border-2 border-primary/30 bg-card overflow-hidden">
          <div className="px-4 py-3 sm:px-5 sm:py-4 gradient-brand">
            <div className="flex items-center justify-between text-primary-foreground">
              <h3 className="font-bold text-sm sm:text-lg">7-Day Average</h3>
              <span className="text-base sm:text-lg font-bold tabular-nums">
                {Math.round(days.reduce((s, d) => s + d.totals.calories, 0) / days.length)} cal/day
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-border">
            {[
              { label: "Protein", value: `${(days.reduce((s, d) => s + d.totals.protein, 0) / days.length).toFixed(0)}g` },
              { label: "Carbs", value: `${(days.reduce((s, d) => s + d.totals.carbohydrates, 0) / days.length).toFixed(0)}g` },
              { label: "Fat", value: `${(days.reduce((s, d) => s + d.totals.fat, 0) / days.length).toFixed(0)}g` },
              { label: "Fiber", value: `${(days.reduce((s, d) => s + d.totals.fiber, 0) / days.length).toFixed(0)}g` },
            ].map((item) => (
              <div key={item.label} className="px-2 py-3 sm:px-4 sm:py-4 text-center">
                <div className="text-base sm:text-lg font-bold tabular-nums">{item.value}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day-by-day entries */}
      {days.map((day) => (
        <DaySection key={day.date} day={day} />
      ))}
    </div>
  );
};
