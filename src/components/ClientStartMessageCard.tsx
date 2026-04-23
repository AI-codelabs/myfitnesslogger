import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Target, ChevronDown, LucideIcon } from "lucide-react";

interface Msg {
  voice_memo: string;
  client_positive: string[];
  client_attention: string[];
  client_actions: string[];
  published_at: string | null;
}

interface SectionCardProps {
  title: string;
  items: string[];
  Icon: LucideIcon;
  iconClass: string;
  headerClass: string;
  borderClass: string;
  dotClass: string;
  countLabel: string;
}

function SectionCard({
  title,
  items,
  Icon,
  iconClass,
  headerClass,
  borderClass,
  dotClass,
  countLabel,
}: SectionCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <Card className={`overflow-hidden ${borderClass}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-90 transition ${headerClass}`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight">{title}</p>
          <p className="text-xs text-muted-foreground">
            {items.length} {countLabel}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="p-4 space-y-2 border-t">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground/90">
              <span className={`mt-2 h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
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
  const countLabel = tx("punten", "points");

  const sections: Omit<SectionCardProps, "countLabel">[] = [
    {
      title: tx("✅ Positief", "✅ Positive"),
      items: msg.client_positive ?? [],
      Icon: CheckCircle2,
      iconClass: "text-emerald-600 dark:text-emerald-400",
      headerClass: "bg-emerald-500/10",
      borderClass: "border-emerald-500/20",
      dotClass: "bg-emerald-500",
    },
    {
      title: tx("⚠️ Aandachtspunten", "⚠️ Attention points"),
      items: msg.client_attention ?? [],
      Icon: AlertTriangle,
      iconClass: "text-amber-600 dark:text-amber-400",
      headerClass: "bg-amber-500/10",
      borderClass: "border-amber-500/20",
      dotClass: "bg-amber-500",
    },
    {
      title: tx("🎯 Actiepunten", "🎯 Action points"),
      items: msg.client_actions ?? [],
      Icon: Target,
      iconClass: "text-primary",
      headerClass: "bg-primary/10",
      borderClass: "border-primary/20",
      dotClass: "bg-primary",
    },
  ].filter((s) => s.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 items-start">
      {sections.map((s) => (
        <SectionCard key={s.title} {...s} countLabel={countLabel} />
      ))}
    </div>
  );
}
