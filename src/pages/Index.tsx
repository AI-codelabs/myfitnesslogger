import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import CoachDashboard from "./CoachDashboard";
import { Loader2 } from "lucide-react";

const Index = () => {
  const { role, loading } = useAuth();

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
        <CoachDashboard />
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
