import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mail, CheckCircle2, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";

interface Connection {
  email: string;
  connected_at: string;
}

export function GmailConnectionCard() {
  const { user } = useAuth();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("coach_email_connections")
      .select("email, connected_at")
      .eq("coach_id", user.id)
      .maybeSingle();
    setConnection(data ?? null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Handle redirect-back query params
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail_connected") === "1") {
      toast.success("Gmail connected");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("gmail_error")) {
      toast.error(`Couldn't connect Gmail: ${params.get("gmail_error")}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleConnect = async () => {
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke("gmail-oauth-start", {
      body: { returnTo: window.location.origin + "/account" },
    });
    if (error || !data?.url) {
      toast.error(error?.message || "Failed to start Google sign-in");
      setConnecting(false);
      return;
    }
    window.location.href = data.url;
  };

  const handleDisconnect = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("coach_email_connections")
      .delete()
      .eq("coach_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setConnection(null);
    toast.success("Gmail disconnected");
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <Mail className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Email sending</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect your Gmail so client invites are sent from your address.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : connection ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm rounded-md bg-muted/40 border border-border/60 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500 flex-shrink-0" />
            <span className="truncate">
              Connected as <strong>{connection.email}</strong>
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-2">
            <Unplug className="h-4 w-4" />
            Disconnect
          </Button>
        </div>
      ) : (
        <Button onClick={handleConnect} disabled={connecting} className="gap-2">
          {connecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          Connect Gmail
        </Button>
      )}
    </Card>
  );
}
