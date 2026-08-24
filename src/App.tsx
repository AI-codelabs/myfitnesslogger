import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Signup from "./pages/Signup.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import ChangePassword from "./pages/ChangePassword.tsx";
import Account from "./pages/Account.tsx";
import NotFound from "./pages/NotFound.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import ClientProfile from "./pages/ClientProfile.tsx";
import Clients from "./pages/Clients.tsx";
import Workouts from "./pages/Workouts.tsx";
import CoachTasks from "./pages/CoachTasks.tsx";
import WorkoutPlan from "./pages/WorkoutPlan.tsx";
import ClientNutrition from "./pages/ClientNutrition.tsx";
import ClientMealPlanView from "./pages/ClientMealPlanView.tsx";
import ClientTraining from "./pages/ClientTraining.tsx";
import LogWorkout from "./pages/LogWorkout.tsx";
import ClientWorkoutSession from "./pages/ClientWorkoutSession.tsx";
import WeeklyCheckin from "./pages/WeeklyCheckin.tsx";
import Progression from "./pages/Progression.tsx";
import { AppLayout } from "./components/AppLayout";
import Settings from "./pages/Settings.tsx";
import MyIntake from "./pages/MyIntake.tsx";
import NutritionTemplates from "./pages/NutritionTemplates.tsx";

import { isRecoveryActive } from "@/lib/recovery";

const queryClient = new QueryClient();

/**
 * While a password-recovery link is being processed the user must not be able
 * to reach any authenticated page — force them to set a new password first.
 */
const RecoveryGate = ({ children }: { children: JSX.Element }) => {
  const location = useLocation();
  if (isRecoveryActive() && location.pathname !== "/reset-password") {
    return <Navigate to={`/reset-password${location.search}${location.hash}`} replace />;
  }
  return children;
};

const Protected = ({ children, requireOnboarding = true }: { children: JSX.Element; requireOnboarding?: boolean }) => {
  const { session, loading, role, onboardingComplete } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  // Gate clients (role=user) until onboarding is complete
  if (
    requireOnboarding &&
    role === "user" &&
    onboardingComplete === false &&
    location.pathname !== "/onboarding"
  ) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
};

const PublicOnly = ({ children }: { children: JSX.Element }) => {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (session) return <Navigate to="/" replace />;
  return children;
};


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <RecoveryGate>
          <Routes>
            <Route path="/" element={<Protected><Index /></Protected>} />
            <Route path="/clients" element={<Protected><AppLayout><Clients /></AppLayout></Protected>} />
            <Route path="/tasks" element={<Protected><AppLayout><CoachTasks /></AppLayout></Protected>} />
            <Route path="/account" element={<Protected><AppLayout><Account /></AppLayout></Protected>} />
            <Route path="/account/intake" element={<Protected><AppLayout><MyIntake /></AppLayout></Protected>} />
            <Route path="/change-password" element={<Protected><AppLayout><ChangePassword /></AppLayout></Protected>} />
            <Route path="/settings" element={<Protected><AppLayout><Settings /></AppLayout></Protected>} />
            <Route path="/onboarding" element={<Protected requireOnboarding={false}><Onboarding /></Protected>} />
            <Route path="/clients/:clientId" element={<Protected><AppLayout><ClientProfile /></AppLayout></Protected>} />
            <Route path="/clients/:clientId/sessions/:sessionId" element={<Protected><AppLayout><ClientWorkoutSession /></AppLayout></Protected>} />
            <Route path="/workouts" element={<Protected><AppLayout><Workouts /></AppLayout></Protected>} />
            <Route path="/nutrition-templates" element={<Protected><AppLayout><NutritionTemplates /></AppLayout></Protected>} />
            <Route path="/workouts/:planId" element={<Protected><AppLayout><WorkoutPlan /></AppLayout></Protected>} />
            <Route path="/nutrition" element={<Protected><AppLayout><ClientNutrition /></AppLayout></Protected>} />
            <Route path="/meal-plan" element={<Protected><AppLayout><ClientMealPlanView /></AppLayout></Protected>} />
            <Route path="/training" element={<Protected><AppLayout><ClientTraining /></AppLayout></Protected>} />
            <Route path="/training/log/new" element={<Protected><AppLayout><LogWorkout /></AppLayout></Protected>} />
            <Route path="/training/log/:sessionId" element={<Protected><AppLayout><LogWorkout /></AppLayout></Protected>} />
            <Route path="/check-in" element={<Protected><AppLayout><WeeklyCheckin /></AppLayout></Protected>} />
            <Route path="/progression" element={<Protected><AppLayout><Progression /></AppLayout></Protected>} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </RecoveryGate>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
