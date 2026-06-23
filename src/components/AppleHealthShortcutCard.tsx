import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lang } from "@/lib/onboardingSchema";
import {
  issueNutritionIngestToken,
  listNutritionIngestTokens,
  revokeNutritionIngestToken,
  type NutritionIngestToken,
  type NutritionIngestTokenIssue,
} from "@/lib/nutritionIngest";
import { Check, Clipboard, ExternalLink, Loader2, RefreshCw, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  lang: Lang;
  onTokenUsed?: () => void;
  variant?: "card" | "panel";
}

const SHORTCUT_NAME = "Coach Nutrition Sync";
const DEFAULT_SHORTCUT_TEMPLATE_URL = "https://www.icloud.com/shortcuts/08fb83fa1da44b81880d135344f4bd74";
const SHORTCUT_TEMPLATE_URL =
  (import.meta.env.VITE_APPLE_HEALTH_SHORTCUT_URL as string | undefined) ||
  DEFAULT_SHORTCUT_TEMPLATE_URL;

export function AppleHealthShortcutCard({ lang, onTokenUsed, variant = "card" }: Props) {
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<NutritionIngestToken[]>([]);
  const [endpoint, setEndpoint] = useState("");
  const [issued, setIssued] = useState<NutritionIngestTokenIssue | null>(null);
  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);

  const activeTokens = useMemo(
    () => tokens.filter((token) => !token.revoked_at),
    [tokens],
  );

  const lastUsed = useMemo(() => {
    const used = activeTokens
      .map((token) => token.last_used_at)
      .filter((value): value is string => !!value)
      .sort();
    const latest = used[used.length - 1];
    return latest ? new Date(latest).toLocaleString(lang === "nl" ? "nl-NL" : "en-US") : null;
  }, [activeTokens, lang]);

  const loadTokens = async () => {
    setLoading(true);
    const res = await listNutritionIngestTokens();
    setLoading(false);
    if (!res.success) {
      toast.error(res.error || t("Kon sync tokens niet laden", "Could not load sync tokens"));
      return;
    }
    setTokens(res.tokens);
    if (res.endpoint) setEndpoint(res.endpoint);
    if (res.tokens.some((token) => token.last_used_at)) onTokenUsed?.();
  };

  useEffect(() => {
    loadTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t(`${label} gekopieerd`, `${label} copied`));
    } catch {
      toast.error(t("Kopiëren mislukt", "Copy failed"));
    }
  };

  const issueToken = async () => {
    setIssuing(true);
    const res = await issueNutritionIngestToken();
    setIssuing(false);
    if (!res.success) {
      toast.error(res.error || t("Token aanmaken mislukt", "Could not create token"));
      return;
    }
    setIssued(res.data);
    setEndpoint(res.data.endpoint);
    toast.success(t("Shortcut-token aangemaakt", "Shortcut token created"));
    await loadTokens();
  };

  const revokeToken = async (tokenId: string) => {
    setRevokingId(tokenId);
    const res = await revokeNutritionIngestToken(tokenId);
    setRevokingId(null);
    if (!res.success) {
      toast.error(res.error || t("Token intrekken mislukt", "Could not revoke token"));
      return;
    }
    toast.success(t("Token ingetrokken", "Token revoked"));
    await loadTokens();
  };

  const runShortcutUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
  const setupJson = issued
    ? JSON.stringify(
        {
          endpoint: issued.endpoint,
          token: issued.token,
          shortcut_name: issued.shortcut_name,
        },
        null,
        2,
      )
    : "";

  return (
    <div
      className={cn(
        "space-y-4",
        variant === "card" && "rounded-lg border bg-card text-card-foreground shadow-sm p-4 sm:p-5",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-sky-500/10 text-sky-600">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-medium">
              {t("Apple Health Shortcut", "Apple Health Shortcut")}{" "}
              <span className="ml-1 text-xs text-muted-foreground">
                {activeTokens.length > 0 ? t("ingesteld", "configured") : t("niet ingesteld", "not configured")}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "Synchroniseer dagelijkse macro's uit Apple Health zonder Cronometer-login in onze app.",
                "Sync daily macros from Apple Health without a Cronometer login in our app.",
              )}
            </p>
            {lastUsed && (
              <p className="text-xs text-emerald-600 mt-1">
                {t("Laatste Shortcut sync", "Last Shortcut sync")}: {lastUsed}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={loadTokens} disabled={loading} className="flex-1 sm:flex-none">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {t("Status", "Status")}
          </Button>
          <Button onClick={issueToken} disabled={issuing} className="flex-1 sm:flex-none">
            {issuing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            {t("Token maken", "Create token")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">{t("Aanbevolen setup", "Recommended setup")}</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>{t("Verbind Cronometer of je voedingsapp met Apple Health en zet schrijven voor calorieën en macro's aan.", "Connect Cronometer or your food tracker to Apple Health and enable writes for calories and macros.")}</li>
          <li>{t("Installeer de Shortcut en plak de token wanneer daarom gevraagd wordt.", "Install the Shortcut and paste the token when prompted.")}</li>
          <li>{t("Laat de Shortcut de laatste 7 dagen uit Apple Health lezen en naar ons endpoint sturen.", "Let the Shortcut read the last 7 days from Apple Health and send them to our endpoint.")}</li>
          <li>{t("Maak in Shortcuts een persoonlijke automatisering, bijvoorbeeld dagelijks in de avond.", "Create a personal automation in Shortcuts, for example every evening.")}</li>
        </ol>
      </div>

      {SHORTCUT_TEMPLATE_URL ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" asChild className="flex-1">
            <a href={SHORTCUT_TEMPLATE_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              {t("Installeer Shortcut", "Install Shortcut")}
            </a>
          </Button>
          <Button variant="outline" asChild className="flex-1">
            <a href={runShortcutUrl}>
              <ExternalLink className="h-4 w-4 mr-2" />
              {t("Run Shortcut nu", "Run Shortcut now")}
            </a>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t(
            "Shortcut-template nog niet geconfigureerd. Gebruik voorlopig endpoint en token hieronder om de Shortcut handmatig te bouwen.",
            "Shortcut template is not configured yet. Use the endpoint and token below to build the Shortcut manually for now.",
          )}
        </div>
      )}

      {issued && (
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
            <Check className="h-4 w-4" />
            {t("Bewaar deze gegevens nu; de token wordt maar één keer getoond.", "Save these details now; the token is only shown once.")}
          </div>
          <FieldRow
            label={t("Endpoint", "Endpoint")}
            value={issued.endpoint}
            onCopy={() => copy(issued.endpoint, "Endpoint")}
          />
          <FieldRow
            label="Token"
            value={issued.token}
            onCopy={() => copy(issued.token, "Token")}
          />
          <Button variant="secondary" size="sm" onClick={() => copy(setupJson, t("Setup JSON", "Setup JSON"))}>
            <Clipboard className="h-4 w-4 mr-2" />
            {t("Kopieer setup JSON", "Copy setup JSON")}
          </Button>
        </div>
      )}

      {activeTokens.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {t("Actieve Shortcut tokens", "Active Shortcut tokens")}
          </p>
          <div className="space-y-2">
            {activeTokens.map((token) => (
              <div key={token.id} className="rounded-lg border px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{token.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("Aangemaakt", "Created")}: {new Date(token.created_at).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US")}
                    {" · "}
                    {token.last_used_at
                      ? `${t("laatst gebruikt", "last used")}: ${new Date(token.last_used_at).toLocaleString(lang === "nl" ? "nl-NL" : "en-US")}`
                      : t("nog niet gebruikt", "not used yet")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeToken(token.id)}
                  disabled={revokingId === token.id}
                >
                  {revokingId === token.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {endpoint && !issued && (
        <p className="text-xs text-muted-foreground">
          {t("Ingest endpoint", "Ingest endpoint")}: <span className="font-mono">{endpoint}</span>
        </p>
      )}
    </div>
  );
}

function FieldRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <Input value={value} readOnly className="font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" onClick={onCopy}>
          <Clipboard className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
