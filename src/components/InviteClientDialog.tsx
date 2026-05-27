import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}

export function InviteClientDialog({ open, onOpenChange, onInvited }: Props) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [coachEmail, setCoachEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await supabase
        .from("coach_email_connections")
        .select("email")
        .eq("coach_id", user.id)
        .maybeSingle();
      setGmailConnected(!!data);
      setCoachEmail(data?.email ?? null);
    })();
  }, [open, user]);

  const handleClose = (next: boolean) => {
    if (!next) setEmail("");
    onOpenChange(next);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    if (!user) return;
    setLoading(true);

    // 1. Create invitation row
    const { data: invite, error: inviteErr } = await supabase
      .from("invitations")
      .insert({ coach_id: user.id, email: parsed.data.email.toLowerCase() })
      .select("token")
      .single();

    if (inviteErr) {
      setLoading(false);
      toast.error(inviteErr.message);
      return;
    }

    const PUBLIC_APP_URL = "https://myfitnesslogger.lovable.app";
    const inviteLink = `${PUBLIC_APP_URL}/signup?token=${invite.token}`;

    // 2. Send email via coach's Gmail
    const { error: sendErr } = await supabase.functions.invoke("send-invite-email", {
      body: {
        recipientEmail: parsed.data.email.toLowerCase(),
        inviteToken: invite.token,
        inviteLink,
        coachName: user.user_metadata?.display_name || user.email,
      },
    });

    setLoading(false);

    if (sendErr) {
      toast.error(`Invitation created but email failed: ${sendErr.message}`);
    } else {
      toast.success("Invitation sent");
    }
    onInvited();
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a client</DialogTitle>
          <DialogDescription>
            We'll email them an invitation link from your connected Gmail.
          </DialogDescription>
        </DialogHeader>

        {gmailConnected === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
          </div>
        ) : !gmailConnected ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/40 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertCircle className="h-4 w-4 text-primary" />
                Connect Gmail first
              </div>
              <p className="text-sm text-muted-foreground">
                You need to connect a Gmail account before sending invites. Invitations will be sent from your address so clients can reply directly to you.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button asChild>
                <Link to="/account">
                  <Mail className="h-4 w-4 mr-2" />
                  Go to Account
                </Link>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="truncate">Sending from {coachEmail}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Client email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="client@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="h-11"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
