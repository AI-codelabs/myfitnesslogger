import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const ClientNutrition = () => {
  const { user } = useAuth();
  const [lang] = useState<Lang>(() => (localStorage.getItem("onbLang") as Lang) || "nl");
  const [loading, setLoading] = useState(true);
  const [nutrition, setNutrition] = useState<any>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("nutrition_plans")
        .select("*")
        .eq("client_id", user.id)
        .maybeSingle();
      setNutrition(data);
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {lang === "nl" ? "Voeding" : "Nutrition"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {lang === "nl"
            ? "Het voedingsschema dat je coach voor je heeft samengesteld."
            : "The nutrition plan your coach has set up for you."}
        </p>
      </div>

      {!nutrition || !nutrition.completed_at ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {lang === "nl"
            ? "Je coach heeft nog geen voedingsschema voor je opgesteld."
            : "Your coach hasn't set up a nutrition plan for you yet."}
        </Card>
      ) : (
        <Card className="p-5 space-y-3">
          <div>
            <h3 className="font-semibold">
              {lang === "nl" ? "Voedingsschema" : "Nutrition plan"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {lang === "nl" ? "Laatst bijgewerkt" : "Last updated"}:{" "}
              {new Date(nutrition.updated_at).toLocaleDateString()}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label={lang === "nl" ? "Geslacht" : "Gender"} value={nutrition.gender} />
            <Stat label={lang === "nl" ? "Leeftijd" : "Age"} value={nutrition.age} />
            <Stat
              label={lang === "nl" ? "Lengte" : "Height"}
              value={nutrition.height_cm ? `${nutrition.height_cm} cm` : null}
            />
            <Stat
              label={lang === "nl" ? "Gewicht" : "Weight"}
              value={nutrition.weight_kg ? `${nutrition.weight_kg} kg` : null}
            />
          </div>

          {nutrition.details?.calories ? (
            <>
              <div className="h-px bg-border my-1" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {lang === "nl" ? "Dagelijkse macro's" : "Daily macros"}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat
                  label={lang === "nl" ? "Calorieën" : "Calories"}
                  value={`${nutrition.details.calories} kcal`}
                />
                <Stat
                  label={lang === "nl" ? "Eiwit" : "Protein"}
                  value={`${nutrition.details.protein_g} g`}
                />
                <Stat
                  label={lang === "nl" ? "Koolhydraten" : "Carbs"}
                  value={`${nutrition.details.carbs_g} g`}
                />
                <Stat
                  label={lang === "nl" ? "Vet" : "Fat"}
                  value={`${nutrition.details.fat_g} g`}
                />
              </div>
              <MacroPie
                lang={lang}
                protein={nutrition.details.protein_g}
                carbs={nutrition.details.carbs_g}
                fat={nutrition.details.fat_g}
              />
            </>
          ) : null}
        </Card>
      )}
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: any }) => (
  <div className="rounded-md border p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium mt-0.5">{value || "—"}</p>
  </div>
);

const MacroPie = ({
  lang,
  protein,
  carbs,
  fat,
}: {
  lang: Lang;
  protein: number;
  carbs: number;
  fat: number;
}) => {
  const data = [
    { name: lang === "nl" ? "Koolhydraten" : "Carbs", value: Number(carbs) || 0, color: "hsl(340 75% 60%)" },
    { name: lang === "nl" ? "Eiwitten" : "Protein", value: Number(protein) || 0, color: "hsl(210 80% 60%)" },
    { name: lang === "nl" ? "Vetten" : "Fat", value: Number(fat) || 0, color: "hsl(25 85% 60%)" },
  ];
  if (data.every((d) => d.value === 0)) return null;
  return (
    <div className="mt-2 rounded-md border p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
        {lang === "nl" ? "Verdeling" : "Distribution"}
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={2}
              stroke="hsl(var(--background))"
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val: any, name: any) => [`${val} g`, name]}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              formatter={(value: any) => {
                const item = data.find((d) => d.name === value);
                return (
                  <span className="text-xs text-foreground">
                    {value} ({item?.value} g)
                  </span>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ClientNutrition;
