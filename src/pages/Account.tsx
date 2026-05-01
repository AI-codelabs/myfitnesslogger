import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, User as UserIcon, Mail, Shield } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

type PersonalInfo = {
  full_name: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  occupation: string | null;
  primary_goal: string | null;
};

const Account = () => {
  const { user, role, signOut } = useAuth();
  const isCoach = role === "coach";
  const isClient = role === "user";
  const [info, setInfo] = useState<PersonalInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  useEffect(() => {
    if (!isClient || !user) return;
    setLoadingInfo(true);
    supabase
      .from("onboarding_responses")
      .select("full_name, age, height_cm, weight_kg, occupation, primary_goal")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setInfo(data as PersonalInfo | null);
        setLoadingInfo(false);
      });
  }, [isClient, user]);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-2xl mx-auto w-full space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Account</h1>
      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full gradient-brand flex items-center justify-center flex-shrink-0">
            <UserIcon className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">
              {user?.user_metadata?.display_name ?? "—"}
            </p>
            <p className="text-sm text-muted-foreground truncate flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {user?.email}
            </p>
            {role && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 capitalize">
                <Shield className="h-3 w-3" />
                {role}
              </p>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-border/60">
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </Card>

      {isClient && (
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Personal info</h2>
            <p className="text-xs text-muted-foreground">
              Visible to your coach.
            </p>
          </div>
          {loadingInfo ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !info ? (
            <p className="text-sm text-muted-foreground">
              Complete your onboarding to add personal info.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <InfoRow label="Name" value={info.full_name} />
              <InfoRow label="Age" value={info.age} />
              <InfoRow label="Height" value={info.height_cm ? `${info.height_cm} cm` : null} />
              <InfoRow label="Weight" value={info.weight_kg ? `${info.weight_kg} kg` : null} />
              <InfoRow label="Occupation" value={info.occupation} />
              <InfoRow label="Goal" value={info.primary_goal} />
            </div>
          )}
        </Card>
      )}

      {isCoach && <GmailConnectionCard />}
    </div>
  );
};

function InfoRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium truncate">{value ?? "—"}</p>
    </div>
  );
}

export default Account;
