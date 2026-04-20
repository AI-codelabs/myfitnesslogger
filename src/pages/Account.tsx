import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, User as UserIcon, Mail, Shield } from "lucide-react";

const Account = () => {
  const { user, role, signOut } = useAuth();

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-6">Account</h1>
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
    </div>
  );
};

export default Account;
