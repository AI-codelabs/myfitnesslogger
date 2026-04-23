import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

interface Msg {
  voice_memo: string;
  client_positive: string[];
  client_attention: string[];
  client_actions: string[];
  published_at: string | null;
}

export function ClientStartMessageCard({ lang }: { lang: "nl" | "en" }) {
  const { user } = useAuth();
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("coach_messages")
      .select("voice_memo, client_positive, client_attention, client_actions, published_at")
      .eq("client_id", user.id)
      .not("published_at", "is", null)
      .maybeSingle()
      .then(({ data }) => setMsg(data as Msg | null));
  }, [user]);

  if (!msg || !msg.published_at) return null;

  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);

  const sections: Array<{ title: string; items: string[]; tone: string }> = [
    {
      title: tx("✅ Positief", "✅ Positive"),
      items: msg.client_positive ?? [],
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: tx("⚠️ Aandachtspunten", "⚠️ Attention points"),
      items: msg.client_attention ?? [],
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      title: tx("🎯 Actiepunten", "🎯 Action points"),
      items: msg.client_actions ?? [],
      tone: "text-primary",
    },
  ].filter((s) => s.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <Card className="p-5 sm:p-6 mb-6 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <h2 className="font-semibold">{tx("Startbericht van je coach", "Message from your coach")}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map((s) => (
          <div key={s.title} className="space-y-2">
            <p className={`text-sm font-semibold ${s.tone}`}>{s.title}</p>
            <ul className="space-y-1.5">
              {s.items.map((it, i) => (
                <li key={i} className="text-sm text-foreground/90 leading-relaxed">
                  • {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
