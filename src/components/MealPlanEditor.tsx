import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import {
  MealCategory,
  MealItem,
  MealOption,
  MealPlanStructure,
  makeEmptyCategory,
  makeEmptyItem,
  makeEmptyOption,
  optionTotals,
} from "@/lib/mealPlan";
import { cn } from "@/lib/utils";

interface Props {
  value: MealPlanStructure;
  onChange: (next: MealPlanStructure) => void;
}

// Reusable editable table of meal categories → options → food rows.
// Used for both coach templates and per-client assigned meal plans.
export function MealPlanEditor({ value, onChange }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const updateCategories = (updater: (c: MealCategory[]) => MealCategory[]) =>
    onChange({ categories: updater(value.categories) });

  const addCategory = () =>
    updateCategories((cats) => [...cats, makeEmptyCategory(`Meal ${cats.length + 1}`)]);

  const removeCategory = (id: string) =>
    updateCategories((cats) => cats.filter((c) => c.id !== id));

  const renameCategory = (id: string, name: string) =>
    updateCategories((cats) => cats.map((c) => (c.id === id ? { ...c, name } : c)));

  const moveCategory = (id: string, dir: -1 | 1) =>
    updateCategories((cats) => {
      const i = cats.findIndex((c) => c.id === id);
      if (i < 0) return cats;
      const j = i + dir;
      if (j < 0 || j >= cats.length) return cats;
      const copy = [...cats];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const patchCategory = (id: string, patch: (c: MealCategory) => MealCategory) =>
    updateCategories((cats) => cats.map((c) => (c.id === id ? patch(c) : c)));

  const addOption = (catId: string) =>
    patchCategory(catId, (c) => ({
      ...c,
      options: [...c.options, makeEmptyOption(`Option ${c.options.length + 1}`)],
    }));

  const removeOption = (catId: string, optId: string) =>
    patchCategory(catId, (c) => ({
      ...c,
      options: c.options.filter((o) => o.id !== optId),
    }));

  const patchOption = (catId: string, optId: string, patch: (o: MealOption) => MealOption) =>
    patchCategory(catId, (c) => ({
      ...c,
      options: c.options.map((o) => (o.id === optId ? patch(o) : o)),
    }));

  const addItem = (catId: string, optId: string) =>
    patchOption(catId, optId, (o) => ({ ...o, items: [...o.items, makeEmptyItem()] }));

  const removeItem = (catId: string, optId: string, itemId: string) =>
    patchOption(catId, optId, (o) => ({
      ...o,
      items: o.items.filter((i) => i.id !== itemId),
    }));

  const patchItem = (
    catId: string,
    optId: string,
    itemId: string,
    patch: Partial<MealItem>,
  ) =>
    patchOption(catId, optId, (o) => ({
      ...o,
      items: o.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    }));

  return (
    <div className="space-y-3">
      {value.categories.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No meal categories yet. Add your first meal (e.g. Breakfast).
        </Card>
      )}

      {value.categories.map((cat, catIdx) => {
        const isCollapsed = collapsed[cat.id];
        return (
          <Card key={cat.id} className="overflow-hidden">
            <div className="flex items-center gap-2 p-3 bg-muted/40 border-b">
              <button
                type="button"
                onClick={() => setCollapsed((s) => ({ ...s, [cat.id]: !s[cat.id] }))}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Toggle"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              <Input
                value={cat.name}
                onChange={(e) => renameCategory(cat.id, e.target.value)}
                className="h-8 font-semibold max-w-xs"
                placeholder="Meal name (e.g. Breakfast)"
              />
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => moveCategory(cat.id, -1)}
                  disabled={catIdx === 0}
                  className="h-8 w-8 p-0"
                  title="Move up"
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => moveCategory(cat.id, 1)}
                  disabled={catIdx === value.categories.length - 1}
                  className="h-8 w-8 p-0"
                  title="Move down"
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeCategory(cat.id)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  title="Delete meal"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {!isCollapsed && (
              <div className="p-3 space-y-3">
                {cat.options.map((opt) => {
                  const t = optionTotals(opt);
                  return (
                    <div key={opt.id} className="rounded-md border">
                      <div className="flex items-center gap-2 p-2 border-b bg-background">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={opt.name}
                          onChange={(e) =>
                            patchOption(cat.id, opt.id, (o) => ({ ...o, name: e.target.value }))
                          }
                          className="h-7 text-sm font-medium max-w-xs"
                          placeholder="Option name"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeOption(cat.id, opt.id)}
                          className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete option"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="text-left font-medium p-2 min-w-[200px]">Product</th>
                              <th className="text-right font-medium p-2 w-16">P</th>
                              <th className="text-right font-medium p-2 w-16">C</th>
                              <th className="text-right font-medium p-2 w-16">F</th>
                              <th className="text-right font-medium p-2 w-20">kcal</th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {opt.items.map((it) => (
                              <tr key={it.id} className="border-t">
                                <td className="p-1">
                                  <Input
                                    value={it.product}
                                    onChange={(e) =>
                                      patchItem(cat.id, opt.id, it.id, {
                                        product: e.target.value,
                                      })
                                    }
                                    className="h-7 text-xs"
                                    placeholder="e.g. AH Kalkoenfilet (2 plakken)"
                                  />
                                </td>
                                {(["protein_g", "carbs_g", "fat_g", "kcal"] as const).map(
                                  (k) => (
                                    <td key={k} className="p-1">
                                      <Input
                                        type="number"
                                        step="0.1"
                                        value={it[k]}
                                        onChange={(e) =>
                                          patchItem(cat.id, opt.id, it.id, {
                                            [k]: Number(e.target.value) || 0,
                                          } as Partial<MealItem>)
                                        }
                                        className="h-7 text-xs text-right tabular-nums"
                                      />
                                    </td>
                                  ),
                                )}
                                <td className="p-1 text-center">
                                  <button
                                    type="button"
                                    onClick={() => removeItem(cat.id, opt.id, it.id)}
                                    className="text-muted-foreground hover:text-destructive"
                                    aria-label="Remove row"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            <tr
                              className={cn(
                                "border-t bg-muted/20 font-semibold tabular-nums",
                              )}
                            >
                              <td className="p-2 text-right">Total</td>
                              <td className="p-2 text-right">{t.protein_g.toFixed(1)}</td>
                              <td className="p-2 text-right">{t.carbs_g.toFixed(1)}</td>
                              <td className="p-2 text-right">{t.fat_g.toFixed(1)}</td>
                              <td className="p-2 text-right">{Math.round(t.kcal)}</td>
                              <td />
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="p-2 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addItem(cat.id, opt.id)}
                          className="h-7 gap-1"
                        >
                          <Plus className="h-3 w-3" /> Row
                        </Button>
                        <Textarea
                          value={opt.notes ?? ""}
                          onChange={(e) =>
                            patchOption(cat.id, opt.id, (o) => ({
                              ...o,
                              notes: e.target.value,
                            }))
                          }
                          placeholder="Notes (optional)"
                          rows={1}
                          className="text-xs min-h-[32px] flex-1"
                        />
                      </div>
                    </div>
                  );
                })}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addOption(cat.id)}
                  className="gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add option
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      <Button variant="outline" onClick={addCategory} className="gap-1 w-full">
        <Plus className="h-4 w-4" />
        Add meal category
      </Button>
    </div>
  );
}
