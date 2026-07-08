import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Lang, onboardingSections, t } from "@/lib/onboardingSchema";

// Read-only view of the client's own completed onboarding.
// Coaches asked to let clients revisit what they submitted after signup.
export default function MyIntake() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("onbLang") as Lang) || "nl",
  );
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("onboarding_responses")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setResponse(data);
      setLoading(false);
    })();
  }, [user]);

  const formatValue = (name: string, value: any): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean")
      return value ? (lang === "nl" ? "Ja" : "Yes") : lang === "nl" ? "Nee" : "No";
    const field = onboardingSections
      .flatMap((s) => s.fields)
      .find((f) => f.name === name);
    if (Array.isArray(value)) {
      if (field?.options) {
        return value
          .map((v) => {
            const opt = field.options!.find((o) => o.value === v);
            return opt ? t(opt.label, lang) : v;
          })
          .join(", ");
      }
      return value.join(", ");
    }
    if (field?.options) {
      const opt = field.options.find((o) => o.value === value);
      if (opt) return t(opt.label, lang);
    }
    return String(value);
  };

  const readField = (name: string, storeIn?: "column" | "details") => {
    if (!response) return null;
    if (storeIn === "details") {
      const det = (response.details ?? {}) as Record<string, unknown>;
      return det[name];
    }
    return (response as Record<string, unknown>)[name];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-3xl mx-auto w-full">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/account")}
        className="gap-1 mb-4 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" />
        {lang === "nl" ? "Terug" : "Back"}
      </Button>

      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {lang === "nl" ? "Mijn intake" : "My intake"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {response?.completed_at
              ? lang === "nl"
                ? `Ingediend op ${new Date(response.completed_at).toLocaleDateString()}`
                : `Submitted on ${new Date(response.completed_at).toLocaleDateString()}`
              : lang === "nl"
                ? "Nog niet voltooid."
                : "Not yet completed."}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border h-8 p-0.5">
          {(["nl", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => {
                setLang(l);
                localStorage.setItem("onbLang", l);
              }}
              className={`h-full px-2.5 text-xs rounded-sm flex items-center ${
                lang === l
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!response ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {lang === "nl"
            ? "Er is nog geen intake gevonden."
            : "No intake found yet."}
        </Card>
      ) : (
        <div className="space-y-4">
          {onboardingSections.map((section) => (
            <Card key={section.id} className="p-5 space-y-3">
              <h2 className="font-semibold">{t(section.title, lang)}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {section.fields
                  .filter((f) => f.type !== "image" && f.type !== "image-front-side-back")
                  .map((f) => {
                    const raw = readField(f.name, f.storeIn);
                    return (
                      <div key={f.name} className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {t(f.label, lang)}
                        </p>
                        <p className="text-sm font-medium break-words">
                          {formatValue(f.name, raw)}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
