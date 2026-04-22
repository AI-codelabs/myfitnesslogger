import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Loader2, BarChart3, TrendingUp, Users, Dumbbell, Apple, ArrowRight } from "lucide-react";
import { DashboardNotifications } from "@/components/DashboardNotifications";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (role === "coach") {
    return (
      <AppLayout>
        <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-5xl mx-auto w-full">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Stats and insights across your clients.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {[
              { icon: Users, title: "Client overview", desc: "Active, onboarding and pending counts over time." },
              { icon: TrendingUp, title: "Engagement", desc: "Logins and activity trends per week." },
              { icon: BarChart3, title: "Progress", desc: "Aggregated client progress metrics." },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="p-5 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </div>
                <p className="text-xs text-muted-foreground/70 mt-auto">Coming soon</p>
              </Card>
            ))}
          </div>

          <DashboardNotifications />
        </div>
      </AppLayout>
    );
  }

  // Default for user role (placeholder until user dashboard is built)
  return (
    <AppLayout>
      <div className="px-4 py-10 sm:px-8 max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Welcome</h1>
        <p className="text-muted-foreground">Your dashboard is coming soon.</p>
      </div>
    </AppLayout>
  );
};

export default Index;
