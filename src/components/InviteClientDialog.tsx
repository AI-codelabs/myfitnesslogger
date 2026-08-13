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
import { Loader2, Mail, AlertCircle, CheckCircle2, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}

const PUBLIC_APP_URL = window.location.origin;

export function InviteClientDialog({ open, onOpenChange, onInvited }: Props) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [coachEmail, setCoachEmail] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setGeneratedLink(null);
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
    if (!next) {
      setEmail("");
      setGeneratedLink(null);
    }
    onOpenChange(next);
  };

  const createInvitation = async () => {
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return null;
    }
    if (!user) return null;
    const { data: invite, error: inviteErr } = await db
      .from("invitations")
      .insert({ coach_id: user.id, email: parsed.data.email.toLowerCase() })
      .select("token")
      .single();
    if (inviteErr) {
      toast.error(inviteErr.message);
      return null;
    }
    return {
      token: invite.token as string,
      email: parsed.data.email.toLowerCase(),
      link: `${PUBLIC_APP_URL}/signup?token=${invite.token}`,
    };
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const invite = await createInvitation();
    if (!invite) {
      setLoading(false);
      return;
    }
    const { error: sendErr } = await supabase.functions.invoke("send-invite-email", {
      body: {
        recipientEmail: invite.email,
        inviteToken: invite.token,
        inviteLink: invite.link,
        coachName: user?.user_metadata?.display_name || user?.email,
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

  const handleGenerateLink = async () => {
    setLinkLoading(true);
    const invite = await createInvitation();
    setLinkLoading(false);
    if (!invite) return;
    setGeneratedLink(invite.link);
    onInvited();
    toast.success("Invite link generated");
  };

  const copyLink = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    toast.success("Link copied to clipboard");
  };

  const showForm = gmailConnected !== null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a client</DialogTitle>
          <DialogDescription>
            Email them an invite or copy a personal signup link to share yourself.
          </DialogDescription>
        </DialogHeader>

        {gmailConnected === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
          </div>
        ) : generatedLink ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/40 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Invite link ready
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link with {email}. Anyone who signs up via this link will be linked to you as their coach.
              </p>
            </div>
            <div className="flex gap-2">
              <Input readOnly value={generatedLink} className="h-11 font-mono text-xs" />
              <Button type="button" onClick={copyLink} className="h-11">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSendEmail} className="space-y-4">
            {gmailConnected ? (
              <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                <span className="truncate">Email will be sent from {coachEmail}</span>
              </div>
            ) : (
              <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-xs flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                <span>
                  Gmail not connected — you can still generate a link below, or{" "}
                  <Link to="/account" className="underline">connect Gmail</Link> to send by email.
                </span>
              </div>
            )}
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
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateLink}
                disabled={linkLoading || loading}
                className="sm:mr-auto"
              >
                {linkLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Generate link
                  </>
                )}
              </Button>
              <Button type="submit" disabled={loading || linkLoading || !gmailConnected}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send invite
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
