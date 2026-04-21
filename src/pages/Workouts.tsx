import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dumbbell, Sparkles, User as UserIcon } from "lucide-react";
import { CreatePlanDialog } from "@/components/CreatePlanDialog";
import { CreateExerciseDialog } from "@/components/CreateExerciseDialog";

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

  const templates = plans.filter((p) => p.is_template);
  const myPlans = plans.filter((p) => !p.is_template);

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
              <section>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-secondary" /> Predefined templates
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((p) => (
                    <Link key={p.id} to={`/workouts/${p.id}`}>
                      <Card className="h-full hover:border-primary transition-colors">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-base leading-snug">{p.name}</CardTitle>
                            {p.frequency_per_week && (
                              <Badge variant="secondary">{p.frequency_per_week}x/wk</Badge>
                            )}
                          </div>
                          {p.description && (
                            <CardDescription className="line-clamp-2">{p.description}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent>
                          {p.category && (
                            <Badge variant="outline" className="text-xs">
                              {p.category.replace("_", " ")}
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
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
          <Input
            placeholder="Filter by name, muscle group, equipment…"
            value={exFilter}
            onChange={(e) => setExFilter(e.target.value)}
            className="max-w-sm"
          />
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
