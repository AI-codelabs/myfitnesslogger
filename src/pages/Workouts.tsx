import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dumbbell, Sparkles, User as UserIcon, Search, X, Pencil, Video } from "lucide-react";
import { CreatePlanDialog } from "@/components/CreatePlanDialog";
import { ExerciseDialog, type ExerciseRecord } from "@/components/ExerciseDialog";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  frequency_per_week: number | null;
  is_template: boolean;
  coach_id: string | null;
}

interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  is_pro: boolean;
}

export default function Workouts() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exFilter, setExFilter] = useState("");
  const [planSearch, setPlanSearch] = useState("");
  const [planCategory, setPlanCategory] = useState<string>("all");
  const [planFreq, setPlanFreq] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  async function loadPlans() {
    const { data: p } = await supabase
      .from("workout_plans")
      .select("*")
      .order("is_template", { ascending: false })
      .order("name");
    setPlans(p ?? []);
  }

  useEffect(() => {
    (async () => {
      const [, { data: e }] = await Promise.all([
        loadPlans(),
        supabase.from("exercises").select("*").order("muscle_group").order("name"),
      ]);
      setExercises(e ?? []);
      setLoading(false);
    })();
  }, []);

  const filteredEx = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(exFilter.toLowerCase()) ||
      (e.muscle_group ?? "").toLowerCase().includes(exFilter.toLowerCase()) ||
      (e.equipment ?? "").toLowerCase().includes(exFilter.toLowerCase())
  );

  const matchesPlanFilters = (p: Plan) => {
    if (planSearch && !p.name.toLowerCase().includes(planSearch.toLowerCase()) &&
        !(p.description ?? "").toLowerCase().includes(planSearch.toLowerCase())) return false;
    if (planCategory !== "all" && p.category !== planCategory) return false;
    if (planFreq !== "all" && String(p.frequency_per_week ?? "") !== planFreq) return false;
    return true;
  };

  const templates = plans.filter((p) => p.is_template).filter(matchesPlanFilters);
  const myPlans = plans.filter((p) => !p.is_template).filter(matchesPlanFilters);

  const allCategories = Array.from(new Set(plans.map((p) => p.category).filter(Boolean))) as string[];
  const allFreqs = Array.from(new Set(plans.map((p) => p.frequency_per_week).filter(Boolean) as number[])).sort((a, b) => a - b);
  const filtersActive = planSearch !== "" || planCategory !== "all" || planFreq !== "all";
  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Workouts</h1>
          <p className="text-muted-foreground">Manage workout plan templates and the exercise library.</p>
        </div>
        <CreatePlanDialog onCreated={loadPlans} />
      </header>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans" className="gap-2">
            <Dumbbell className="h-4 w-4" /> Plans
          </TabsTrigger>
          <TabsTrigger value="exercises" className="gap-2">
            <Sparkles className="h-4 w-4" /> Exercise Library
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-6 mt-6">
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search plans…"
                    value={planSearch}
                    onChange={(e) => setPlanSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={planCategory} onValueChange={setPlanCategory}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {allCategories.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={planFreq} onValueChange={setPlanFreq}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any frequency</SelectItem>
                    {allFreqs.map((f) => (
                      <SelectItem key={f} value={String(f)}>
                        {f}x / week
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filtersActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setPlanSearch("");
                      setPlanCategory("all");
                      setPlanFreq("all");
                    }}
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </Button>
                )}
              </div>

              <section>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-secondary" /> Predefined templates
                </h2>
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No templates match your filters.</p>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((p) => (
                    <Link key={p.id} to={`/workouts/${p.id}`} className="flex">
                      <Card className="flex flex-col w-full hover:border-primary transition-colors">
                        <CardHeader className="pb-3 space-y-3">
                          <div className="flex items-center justify-between gap-2 min-h-6">
                            {p.category ? (
                              <Badge variant="outline" className="text-[10px] capitalize font-normal">
                                {p.category.replace("_", " ")}
                              </Badge>
                            ) : <span />}
                            {p.frequency_per_week && (
                              <Badge variant="secondary" className="text-[10px]">
                                {p.frequency_per_week}x / week
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-base leading-snug line-clamp-2 min-h-[2.75rem]">
                            {p.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 mt-auto">
                          <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                            {p.description || "—"}
                          </CardDescription>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
                )}
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <UserIcon className="h-4 w-4" /> My plans
                </h2>
                {myPlans.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    You haven't created any custom plans yet. Custom plan creation coming soon.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myPlans.map((p) => (
                      <Link key={p.id} to={`/workouts/${p.id}`}>
                        <Card className="h-full hover:border-primary transition-colors">
                          <CardHeader>
                            <CardTitle className="text-base">{p.name}</CardTitle>
                            {p.description && <CardDescription>{p.description}</CardDescription>}
                          </CardHeader>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </TabsContent>

        <TabsContent value="exercises" className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Input
              placeholder="Filter by name, muscle group, equipment…"
              value={exFilter}
              onChange={(e) => setExFilter(e.target.value)}
              className="max-w-sm"
            />
            <CreateExerciseDialog
              onCreated={async () => {
                const { data } = await supabase
                  .from("exercises")
                  .select("*")
                  .order("muscle_group")
                  .order("name");
                setExercises(data ?? []);
              }}
            />
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Muscle group</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEx.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{e.muscle_group}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{e.equipment}</TableCell>
                    <TableCell>
                      {e.is_pro && (
                        <Badge className="bg-secondary text-secondary-foreground">PRO</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredEx.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No exercises match your filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
          <p className="text-xs text-muted-foreground">
            {exercises.length} exercises in the library.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
