import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Trash2, UserCheck, UserX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Lang, onboardingSections, t } from "@/lib/onboardingSchema";

const ClientProfile = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("onbLang") as Lang) || "nl");
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<any>(null);
  const [response, setResponse] = useState<any>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      const [invQ, respQ] = await Promise.all([
        supabase
          .from("invitations")
          .select("id, email, status, accepted_at, created_at")
          .eq("accepted_user_id", clientId)
          .maybeSingle(),
        supabase
          .from("onboarding_responses")
          .select("*")
          .eq("user_id", clientId)
          .maybeSingle(),
      ]);
      setInvite(invQ.data);
      setResponse(respQ.data);
      setLoading(false);

      // Sign URLs for any uploaded photos
      if (respQ.data) {
        const paths = [
          respQ.data.progress_photo_front_path,
          respQ.data.progress_photo_side_path,
          respQ.data.progress_photo_back_path,
          respQ.data.step_tracker_screenshot_path,
        ].filter(Boolean) as string[];
        const urls: Record<string, string> = {};
        for (const p of paths) {
          const { data } = await supabase.storage
            .from("onboarding-uploads")
            .createSignedUrl(p, 3600);
          if (data) urls[p] = data.signedUrl;
        }
        setPhotoUrls(urls);
      }
    })();
  }, [clientId]);

  const formatValue = (name: string, value: any): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? (lang === "nl" ? "Ja" : "Yes") : lang === "nl" ? "Nee" : "No";
    if (Array.isArray(value)) {
      // Map to localized labels if option exists
      const field = onboardingSections
        .flatMap((s) => s.fields)
        .find((f) => f.name === name);
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
    // Localize single radio value
    const field = onboardingSections.flatMap((s) => s.fields).find((f) => f.name === name);
    if (field?.options) {
      const opt = field.options.find((o) => o.value === value);
      if (opt) return t(opt.label, lang);
    }
    return String(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusVariant =
    invite?.status === "active"
      ? "default"
      : invite?.status === "onboarding"
        ? "secondary"
        : "outline";

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-4xl mx-auto w-full">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1 mb-4 -ml-2">
        <ArrowLeft className="h-4 w-4" />
        {lang === "nl" ? "Terug" : "Back"}
      </Button>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {response?.full_name || invite?.email || "Client"}
          </h1>
          <p className="text-sm text-muted-foreground">{invite?.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant={statusVariant as any} className="capitalize">{invite?.status}</Badge>
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {(["nl", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLang(l);
                  localStorage.setItem("onbLang", l);
                }}
                className={`px-2 py-0.5 text-xs rounded ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {invite && invite.status !== "inactive" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus("inactive")}
              disabled={actionLoading}
              className="gap-1"
            >
              <UserX className="h-4 w-4" />
              {lang === "nl" ? "Op inactief" : "Set inactive"}
            </Button>
          ) : invite ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus("active")}
              disabled={actionLoading}
              className="gap-1"
            >
              <UserCheck className="h-4 w-4" />
              {lang === "nl" ? "Heractiveer" : "Reactivate"}
            </Button>
          ) : null}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={actionLoading} className="gap-1">
                <Trash2 className="h-4 w-4" />
                {lang === "nl" ? "Verwijder" : "Delete"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {lang === "nl" ? "Klant verwijderen?" : "Delete client?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {lang === "nl"
                    ? "Hierdoor wordt deze klant uit jouw lijst verwijderd. Hun account blijft bestaan, maar je hebt geen toegang meer tot hun gegevens."
                    : "This removes the client from your list. Their account stays, but you'll lose access to their data."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{lang === "nl" ? "Annuleer" : "Cancel"}</AlertDialogCancel>
                <AlertDialogAction onClick={deleteClient} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {lang === "nl" ? "Verwijder" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{lang === "nl" ? "Overzicht" : "Overview"}</TabsTrigger>
          <TabsTrigger value="onboarding">{lang === "nl" ? "Intakeformulier" : "Onboarding"}</TabsTrigger>
          <TabsTrigger value="food">{lang === "nl" ? "Voedingslog" : "Food log"}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span>{invite?.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{lang === "nl" ? "Status" : "Status"}</span>
              <span className="capitalize">{invite?.status}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{lang === "nl" ? "Uitgenodigd" : "Invited"}</span>
              <span>{invite?.created_at ? new Date(invite.created_at).toLocaleDateString() : "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{lang === "nl" ? "Onboarding voltooid" : "Onboarding completed"}</span>
              <span>{response?.completed_at ? new Date(response.completed_at).toLocaleDateString() : "—"}</span>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="onboarding" className="mt-4 space-y-4">
          {!response ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              {lang === "nl"
                ? "Deze klant heeft het formulier nog niet ingevuld."
                : "This client hasn't filled out the form yet."}
            </Card>
          ) : (
            onboardingSections.map((sec) => (
              <Card key={sec.id} className="p-5">
                <h3 className="font-semibold mb-3">{t(sec.title, lang)}</h3>
                <div className="space-y-2.5">
                  {sec.fields.map((f) => {
                    if (f.type === "image" || f.type === "image-front-side-back") {
                      const paths =
                        f.type === "image"
                          ? [response[f.name]].filter(Boolean)
                          : [
                              response.progress_photo_front_path,
                              response.progress_photo_side_path,
                              response.progress_photo_back_path,
                            ].filter(Boolean);
                      if (paths.length === 0) return null;
                      return (
                        <div key={f.name}>
                          <p className="text-xs text-muted-foreground mb-2">{t(f.label, lang)}</p>
                          <div className="flex gap-2 flex-wrap">
                            {paths.map((p: string) => (
                              <a key={p} href={photoUrls[p]} target="_blank" rel="noreferrer">
                                <img
                                  src={photoUrls[p]}
                                  alt=""
                                  className="h-28 w-28 object-cover rounded border"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={f.name} className="grid grid-cols-[1fr,1.5fr] gap-3 text-sm py-1.5 border-b last:border-0">
                        <span className="text-muted-foreground">{t(f.label, lang)}</span>
                        <span className="text-foreground">{formatValue(f.name, response[f.name])}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="food" className="mt-4">
          <Card className="p-10 text-center text-sm text-muted-foreground">
            {lang === "nl" ? "Voedingslog komt binnenkort." : "Food log coming soon."}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClientProfile;
