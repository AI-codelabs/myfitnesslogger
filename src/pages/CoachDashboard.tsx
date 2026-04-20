import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UserPlus, Users, Mail, Loader2, Trash2 } from "lucide-react";
import { InviteClientDialog } from "@/components/InviteClientDialog";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
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

interface Invitation {
  id: string;
  email: string;
  status: string;
  accepted_user_id: string | null;
  created_at: string;
  accepted_at: string | null;
}

const CoachDashboard = () => {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("invitations")
      .select("id, email, status, accepted_user_id, created_at, accepted_at")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false });
    setInvitations(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const accepted = invitations.filter((i) => i.status === "accepted");
  const pending = invitations.filter((i) => i.status === "pending");

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {accepted.length} active client{accepted.length === 1 ? "" : "s"} · {pending.length} pending
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 h-11">
          <UserPlus className="h-4 w-4" />
          Add client
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : invitations.length === 0 ? (
        <Card className="p-10 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
          <h3 className="font-semibold mb-1">No clients yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Invite your first client to get started.
          </p>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add client
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {invitations.map((inv) => (
            <Card key={inv.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{inv.email}</p>
                <p className="text-xs text-muted-foreground">
                  {inv.status === "accepted" && inv.accepted_at
                    ? `Joined ${formatDistanceToNow(new Date(inv.accepted_at), { addSuffix: true })}`
                    : `Invited ${formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}`}
                </p>
              </div>
              <Badge
                variant={inv.status === "accepted" ? "default" : "secondary"}
                className="flex-shrink-0"
              >
                {inv.status === "accepted" ? "Active" : inv.status}
              </Badge>
            </Card>
          ))}
        </div>
      )}

      <InviteClientDialog open={dialogOpen} onOpenChange={setDialogOpen} onInvited={load} />
    </div>
  );
};

export default CoachDashboard;
