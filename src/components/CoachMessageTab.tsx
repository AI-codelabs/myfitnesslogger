import { invokeFn } from "@/lib/api/fn";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Plus, Trash2, Send, Save, Mic, MessageSquare, Copy } from "lucide-react";
import { toast } from "sonner";
import { Lang } from "@/lib/onboardingSchema";
import { db } from "@/lib/db";

interface Props {
  clientId: string;
  coachId: string;
  lang: Lang;
}

interface CoachMessage {
  id: string;
  voice_memo: string;
  client_positive: string[];
  client_attention: string[];
  client_actions: string[];
  generated_at: string;
  published_at: string | null;
}

const tx = (lang: Lang, nl: string, en: string) => (lang === "nl" ? nl : en);

export function CoachMessageTab({ clientId, coachId, lang }: Props) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<CoachMessage | null>(null);

  const [voice, setVoice] = useState("");
  const [positive, setPositive] = useState<string[]>([]);
  const [attention, setAttention] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await db
        .from("coach_messages")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (data) {
        setMsg(data as CoachMessage);
        setVoice(data.voice_memo);
        setPositive(data.client_positive ?? []);
        setAttention(data.client_attention ?? []);
        setActions(data.client_actions ?? []);
      }
      setLoading(false);
    })();
  }, [clientId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await invokeFn("generate-coach-message", {
        body: { clientId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setVoice(data.voice_memo ?? "");
      setPositive(data.client_positive ?? []);
      setAttention(data.client_attention ?? []);
      setActions(data.client_actions ?? []);
      toast.success(tx(lang, "Bericht gegenereerd", "Message generated"));
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const save = async (publish: boolean) => {
    setSaving(true);
    const payload = {
      coach_id: coachId,
      client_id: clientId,
      voice_memo: voice,
      client_positive: positive.filter((s) => s.trim()),
      client_attention: attention.filter((s) => s.trim()),
      client_actions: actions.filter((s) => s.trim()),
      generated_at: new Date().toISOString(),
      ...(publish ? { published_at: new Date().toISOString() } : {}),
    };
    const { data, error } = await db
      .from("coach_messages")
      .upsert(payload, { onConflict: "client_id" })
      .select()
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    setMsg(data as CoachMessage);
    toast.success(
      publish
        ? tx(lang, "Bericht gepubliceerd voor klant", "Message published to client")
        : tx(lang, "Concept opgeslagen", "Draft saved"),
    );
  };

  const copyVoice = () => {
    navigator.clipboard.writeText(voice);
    toast.success(tx(lang, "Gekopieerd", "Copied"));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const empty = !msg && !voice && positive.length === 0;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {tx(lang, "Startbericht", "Start message")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              {tx(
                lang,
                "Genereer een persoonlijk startbericht op basis van het intakeformulier, voedingsschema en trainingsschema. De spraakmemo is alleen voor jou; de bulletpoints zie de klant op het dashboard.",
                "Generate a personalised start message based on the intake form, nutrition plan and workout schedule. The voice memo is coach-only; the bullets appear on the client dashboard.",
              )}
            </p>
            {msg && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>
                  {tx(lang, "Laatst gegenereerd", "Last generated")}:{" "}
                  {new Date(msg.generated_at).toLocaleString()}
                </span>
                {msg.published_at ? (
                  <Badge variant="secondary">{tx(lang, "Gepubliceerd", "Published")}</Badge>
                ) : (
                  <Badge variant="outline">{tx(lang, "Concept", "Draft")}</Badge>
                )}
              </div>
            )}
          </div>
          <Button onClick={generate} disabled={generating} className="gap-2">
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {empty
              ? tx(lang, "Genereer", "Generate")
              : tx(lang, "Opnieuw genereren", "Regenerate")}
          </Button>
        </div>
      </Card>

      {(voice || !empty) && (
        <>
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Mic className="h-4 w-4" />
                {tx(lang, "Spraakmemo (alleen voor coach)", "Voice memo (coach only)")}
              </h3>
              <Button variant="ghost" size="sm" onClick={copyVoice} className="gap-1.5 h-8">
                <Copy className="h-3.5 w-3.5" />
                {tx(lang, "Kopieer", "Copy")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {tx(
                lang,
                "Lees deze tekst voor en stuur als spraakmemo via WhatsApp.",
                "Read this script and send it as a voice memo via WhatsApp.",
              )}
            </p>
            <Textarea
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              placeholder={tx(lang, "Spraakmemo tekst…", "Voice memo script…")}
              className="min-h-[280px] text-sm leading-relaxed"
            />
          </Card>

          <Card className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {tx(lang, "Bericht voor klant", "Client message")}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {tx(
                  lang,
                  "Deze bullets verschijnen bovenaan het dashboard van de klant.",
                  "These bullets appear at the top of the client dashboard.",
                )}
              </p>
            </div>

            <BulletEditor
              label={tx(lang, "✅ Positief", "✅ Positive")}
              items={positive}
              onChange={setPositive}
              lang={lang}
            />
            <BulletEditor
              label={tx(lang, "⚠️ Aandachtspunten", "⚠️ Attention points")}
              items={attention}
              onChange={setAttention}
              lang={lang}
            />
            <BulletEditor
              label={tx(lang, "🎯 Actiepunten", "🎯 Action points")}
              items={actions}
              onChange={setActions}
              lang={lang}
            />
          </Card>

          <div className="flex items-center justify-end gap-2 flex-wrap">
            <Button variant="outline" onClick={() => save(false)} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {tx(lang, "Concept opslaan", "Save draft")}
            </Button>
            <Button onClick={() => save(true)} disabled={saving} className="gap-2">
              <Send className="h-4 w-4" />
              {tx(lang, "Publiceren naar klant", "Publish to client")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function BulletEditor({
  label,
  items,
  onChange,
  lang,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  lang: Lang;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={it}
              onChange={(e) => {
                const next = [...items];
                next[idx] = e.target.value;
                onChange(next);
              }}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8 text-muted-foreground"
          onClick={() => onChange([...items, ""])}
        >
          <Plus className="h-3.5 w-3.5" />
          {tx(lang, "Punt toevoegen", "Add bullet")}
        </Button>
      </div>
    </div>
  );
}
