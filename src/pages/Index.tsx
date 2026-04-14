import { useState, useEffect } from "react";
import { CronometerLoginForm } from "@/components/CronometerLoginForm";
import { FoodLogTable } from "@/components/FoodLogTable";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { connectToCronometer, exportData, getSession, clearSession } from "@/lib/cronometer";
import type { DayLog } from "@/types/cronometer";
import { Button } from "@/components/ui/button";

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
        // Session likely expired
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

  // Auto-fetch on first load if already connected
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="container mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg gradient-brand flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Cronometer Connect</h1>
          <div className="ml-auto flex items-center gap-4">
            <ConnectionStatus connected={isConnected} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-5xl">
        {!isConnected ? (
          <CronometerLoginForm onLogin={handleLogin} isLoading={isConnecting} error={error} />
        ) : (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Your Food Log</h2>
                {days.length > 0 && (
                  <p className="text-muted-foreground mt-1">
                    Last 7 days &middot; {days.length} days loaded
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleRetrieve}
                  disabled={isFetching}
                  className="gradient-brand hover:opacity-90 transition-opacity border-0"
                >
                  {isFetching ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Retrieving...
                    </span>
                  ) : (
                    "Retrieve Last 7 Days"
                  )}
                </Button>
                <button
                  onClick={handleDisconnect}
                  className="text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
                {error}
              </div>
            )}

            {isFetching && days.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : days.length > 0 ? (
              <FoodLogTable days={days} />
            ) : (
              <div className="text-center py-20 text-muted-foreground">
                Click "Retrieve Last 7 Days" to load your food data.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
