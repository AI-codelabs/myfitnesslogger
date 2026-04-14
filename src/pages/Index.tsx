import { useState, useEffect } from "react";
import { CronometerLoginForm } from "@/components/CronometerLoginForm";
import { FoodLogTable } from "@/components/FoodLogTable";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { connectToCronometer, exportData, getSession, clearSession } from "@/lib/cronometer";
import type { DayLog } from "@/types/cronometer";
import { Button } from "@/components/ui/button";
import { RefreshCw, LogOut } from "lucide-react";

const Index = () => {
  const [session, setSession] = useState(getSession());
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [days, setDays] = useState<DayLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isConnected = !!session;

  const handleLogin = async (username: string, password: string) => {
    setIsConnecting(true);
    setError(null);
    try {
      const result = await connectToCronometer(username, password);
      if (result.error) {
        setError(result.error);
      } else if (result.session) {
        setSession(result.session);
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRetrieve = async () => {
    if (!session) return;
    setIsFetching(true);
    setError(null);
    try {
      const result = await exportData(session);
      if (result.error) {
        if (result.error.includes("session") || result.error.includes("Login") || result.error.includes("failed")) {
          clearSession();
          setSession(null);
          setError("Session expired. Please sign in again.");
        } else {
          setError(result.error);
        }
      } else if (result.days) {
        setDays(result.days);
      }
    } catch {
      setError("Failed to retrieve data. Please try again.");
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (session && days.length === 0) {
      handleRetrieve();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = () => {
    clearSession();
    setSession(null);
    setDays([]);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Compact mobile header */}
      <header className="border-b border-border/60 sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
        <div className="px-4 py-3 sm:px-6 sm:py-4 flex items-center gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
            </svg>
          </div>
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">Cronometer Connect</h1>
          <div className="ml-auto flex-shrink-0">
            <ConnectionStatus connected={isConnected} />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10 max-w-5xl mx-auto w-full">
        {!isConnected ? (
          <CronometerLoginForm onLogin={handleLogin} isLoading={isConnecting} error={error} />
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Title + actions */}
            <div className="space-y-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Your Food Log</h2>
                {days.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Last 7 days &middot; {days.length} days loaded
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleRetrieve}
                  disabled={isFetching}
                  className="flex-1 sm:flex-none gradient-brand hover:opacity-90 transition-opacity border-0 h-11"
                >
                  {isFetching ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Retrieving...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Retrieve Last 7 Days
                    </span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDisconnect}
                  className="h-11 w-11 flex-shrink-0 text-muted-foreground hover:text-destructive hover:border-destructive/30"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 sm:px-4 sm:py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {isFetching && days.length === 0 ? (
              <div className="flex items-center justify-center py-16 sm:py-20">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : days.length > 0 ? (
              <FoodLogTable days={days} />
            ) : (
              <div className="text-center py-16 sm:py-20 text-muted-foreground text-sm">
                Tap "Retrieve Last 7 Days" to load your food data.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
