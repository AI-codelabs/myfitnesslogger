import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Signup from "./pages/Signup.tsx";
import Account from "./pages/Account.tsx";
import NotFound from "./pages/NotFound.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import ClientProfile from "./pages/ClientProfile.tsx";
import Clients from "./pages/Clients.tsx";
import Workouts from "./pages/Workouts.tsx";
import WorkoutPlan from "./pages/WorkoutPlan.tsx";
import ClientNutrition from "./pages/ClientNutrition.tsx";
import ClientTraining from "./pages/ClientTraining.tsx";
import LogWorkout from "./pages/LogWorkout.tsx";
import { AppLayout } from "./components/AppLayout";

const queryClient = new QueryClient();

const Protected = ({ children, requireOnboarding = true }: { children: JSX.Element; requireOnboarding?: boolean }) => {
  const { session, loading, role, onboardingComplete } = useAuth();
  const location = useLocation();
  if (loading) return null;
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
  if (loading) return null;
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
          <Routes>
            <Route path="/" element={<Protected><Index /></Protected>} />
            <Route path="/clients" element={<Protected><AppLayout><Clients /></AppLayout></Protected>} />
            <Route path="/account" element={<Protected><AppLayout><Account /></AppLayout></Protected>} />
            <Route path="/onboarding" element={<Protected requireOnboarding={false}><Onboarding /></Protected>} />
            <Route path="/clients/:clientId" element={<Protected><AppLayout><ClientProfile /></AppLayout></Protected>} />
            <Route path="/workouts" element={<Protected><AppLayout><Workouts /></AppLayout></Protected>} />
            <Route path="/workouts/:planId" element={<Protected><AppLayout><WorkoutPlan /></AppLayout></Protected>} />
            <Route path="/nutrition" element={<Protected><AppLayout><ClientNutrition /></AppLayout></Protected>} />
            <Route path="/training" element={<Protected><AppLayout><ClientTraining /></AppLayout></Protected>} />
            <Route path="/training/log/new" element={<Protected><AppLayout><LogWorkout /></AppLayout></Protected>} />
            <Route path="/training/log/:sessionId" element={<Protected><AppLayout><LogWorkout /></AppLayout></Protected>} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/signup" element={<Signup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
