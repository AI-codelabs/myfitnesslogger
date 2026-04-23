import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Sparkles, CheckCircle2, AlertTriangle, Target, ChevronDown } from "lucide-react";

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
  const [open, setOpen] = useState(false);

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

  const sections = [
    {
      key: "positive",
      title: tx("Positief", "Positive"),
      items: msg.client_positive ?? [],
      Icon: CheckCircle2,
      iconClass: "text-emerald-600 dark:text-emerald-400",
      badgeClass: "bg-emerald-500/10 border-emerald-500/20",
      dotClass: "bg-emerald-500",
    },
    {
      key: "attention",
      title: tx("Aandachtspunten", "Attention points"),
      items: msg.client_attention ?? [],
      Icon: AlertTriangle,
      iconClass: "text-amber-600 dark:text-amber-400",
      badgeClass: "bg-amber-500/10 border-amber-500/20",
      dotClass: "bg-amber-500",
    },
    {
      key: "actions",
      title: tx("Actiepunten", "Action points"),
      items: msg.client_actions ?? [],
      Icon: Target,
      iconClass: "text-primary",
      badgeClass: "bg-primary/10 border-primary/20",
      dotClass: "bg-primary",
    },
  ].filter((s) => s.items.length > 0);

  if (sections.length === 0) return null;

  const totalCount = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <Card className="overflow-hidden mb-6 border-primary/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent text-left hover:bg-primary/5 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-tight">
            {tx("Startbericht van je coach", "Message from your coach")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {open
              ? tx("Klik om te verbergen", "Click to hide")
              : tx(`${totalCount} punten · klik om te bekijken`, `${totalCount} points · click to view`)}
          </p>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="divide-y md:divide-y-0 md:divide-x md:grid md:grid-cols-3">
          {sections.map(({ key, title, items, Icon, iconClass, badgeClass, dotClass }) => (
            <div key={key} className="p-5 space-y-3">
              <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border ${badgeClass}`}>
                <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
                <span className="text-xs font-semibold tracking-wide uppercase">{title}</span>
              </div>
              <ul className="space-y-2">
                {items.map((it, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground/90">
                    <span className={`mt-2 h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
