import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Image as ImageIcon, Send } from "lucide-react";
import { GmailConnectionCard } from "@/components/GmailConnectionCard";

type TemplateKey = "sunday" | "monday";

interface TemplateRow {
  subject: string;
  body: string;
  header_image_url: string | null;
}

const DEFAULTS: Record<TemplateKey, TemplateRow> = {
  sunday: {
    subject: "Je weekly check-in staat klaar 📋",
    header_image_url: null,
    body:
      "Hi {{name}},\n\nJe weekly check-in staat klaar. Neem 5 minuten de tijd om je gewicht, training en gevoel van afgelopen week door te geven — zo kunnen we samen kijken wat goed ging en waar we kunnen bijsturen.\n\nHet kost je echt maar een paar minuten 💪",
  },
  monday: {
    subject: "Reminder: vergeet je weekly check-in niet ⏰",
    header_image_url: null,
    body:
      "Hi {{name}},\n\nKleine herinnering — je hebt je weekly check-in van afgelopen week nog niet ingevuld. Het kost je maar een paar minuten en het helpt me enorm om je optimaal te begeleiden.\n\nBedankt! 🙌",
  },
};

const LABELS: Record<TemplateKey, { title: string; desc: string }> = {
  sunday: { title: "Sunday — check-in is ready", desc: "Sent every Sunday to all active clients." },
  monday: { title: "Monday — reminder", desc: "Sent on Monday only to clients who haven't completed their check-in." },
};

export default function Settings() {
  const { user } = useAuth();
  const [active, setActive] = useState<TemplateKey>("sunday");
  const [templates, setTemplates] = useState<Record<TemplateKey, TemplateRow>>({
    sunday: DEFAULTS.sunday,
    monday: DEFAULTS.monday,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState<TemplateKey | null>(null);

  const sendTest = async (key: TemplateKey) => {
    if (!testEmail.trim()) {
      toast.error("Enter an email address first");
      return;
    }
    setSendingTest(key);
    const { data, error } = await invokeFn("send-test-checkin-email", {
      body: { mode: key, recipientEmail: testEmail.trim() },
    });
    setSendingTest(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to send test email");
      return;
    }
    toast.success(`Test email sent to ${testEmail.trim()}`);
  };
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("email_templates")
        .select("template_key, subject, body, header_image_url")
        .eq("coach_id", user.id);
      if (error) {
        toast.error("Failed to load templates");
      } else if (data) {
        const next = { ...templates };
        for (const row of data) {
          if (row.template_key === "sunday" || row.template_key === "monday") {
            next[row.template_key as TemplateKey] = {
              subject: row.subject ?? "",
              body: row.body ?? "",
              header_image_url: row.header_image_url,
            };
          }
        }
        setTemplates(next);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const current = templates[active];

  const update = (patch: Partial<TemplateRow>) =>
    setTemplates((t) => ({ ...t, [active]: { ...t[active], ...patch } }));

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("email_templates")
      .upsert(
        {
          coach_id: user.id,
          template_key: active,
          subject: current.subject,
          body: current.body,
          header_image_url: current.header_image_url,
        },
        { onConflict: "coach_id,template_key" },
      );
    setSaving(false);
    if (error) toast.error("Save failed: " + error.message);
    else toast.success("Template saved");
  };

  const onUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/${active}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("email-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setUploading(false);
      toast.error("Upload failed: " + error.message);
      return;
    }
    const { data } = supabase.storage.from("email-assets").getPublicUrl(path);
    update({ header_image_url: data.publicUrl });
    setUploading(false);
    toast.success("Image uploaded");
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuration</h1>
        <p className="text-muted-foreground text-sm">
          Manage your integrations and customize the automated check-in emails sent to your clients.
        </p>
      </div>

      <GmailConnectionCard />

      <Card>
        <CardHeader>
          <CardTitle>Email templates</CardTitle>
          <CardDescription>
            Use placeholders <code className="px-1 py-0.5 rounded bg-muted text-xs">{"{{name}}"}</code> for
            the client's first name and{" "}
            <code className="px-1 py-0.5 rounded bg-muted text-xs">{"{{checkin_url}}"}</code> for the
            check-in link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={active} onValueChange={(v) => setActive(v as TemplateKey)}>
            <TabsList>
              <TabsTrigger value="sunday">Sunday</TabsTrigger>
              <TabsTrigger value="monday">Monday</TabsTrigger>
            </TabsList>

            {(["sunday", "monday"] as TemplateKey[]).map((key) => (
              <TabsContent key={key} value={key} className="space-y-4 mt-4">
                <div className="text-sm">
                  <p className="font-medium">{LABELS[key].title}</p>
                  <p className="text-muted-foreground">{LABELS[key].desc}</p>
                </div>

                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={current.subject}
                    onChange={(e) => update({ subject: e.target.value })}
                    placeholder="Email subject"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Body</Label>
                  <Textarea
                    value={current.body}
                    onChange={(e) => update({ body: e.target.value })}
                    rows={10}
                    placeholder={"Hi {{name}},\n\nYour check-in is ready..."}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Empty lines start a new paragraph. A “Vul je check-in in” button is added automatically.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Header image (optional)</Label>
                  {current.header_image_url ? (
                    <div className="space-y-2">
                      <div className="border rounded-md p-2 bg-muted/30">
                        <img
                          src={current.header_image_url}
                          alt="Header"
                          className="max-h-40 mx-auto rounded"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => update({ header_image_url: null })}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove image
                      </Button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 border border-dashed rounded-md p-4 cursor-pointer hover:bg-muted/30 transition">
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        {uploading ? "Uploading..." : "Click to upload an image"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onUpload(f);
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-border/60">
                  <div className="flex-1 flex gap-2 items-center">
                    <Input
                      type="email"
                      placeholder="test@example.com"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button
                      variant="secondary"
                      onClick={() => sendTest(key)}
                      disabled={sendingTest === key}
                    >
                      {sendingTest === key ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      Send test
                    </Button>
                  </div>
                  <div className="flex gap-2 sm:ml-auto">
                    <Button
                      variant="outline"
                      onClick={() => update(DEFAULTS[key])}
                      disabled={saving}
                    >
                      Reset to default
                    </Button>
                    <Button onClick={save} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                      Save template
                    </Button>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
