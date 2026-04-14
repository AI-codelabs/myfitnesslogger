import { useState, useEffect, useCallback } from "react";
import { MfpLoginForm } from "@/components/MfpLoginForm";
import { FoodLogTable } from "@/components/FoodLogTable";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import {
  loginToMfp,
  fetchFoodLog,
  refreshMfpToken,
  saveSession,
  getSession,
  clearSession,
  type MfpSession,
} from "@/lib/mfp";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FoodLogData } from "@/types/mfp";

const Index = () => {
  const [session, setSession] = useState<MfpSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [foodLog, setFoodLog] = useState<FoodLogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Restore session — validate it has required fields
  useEffect(() => {
    const saved = getSession();
    if (saved && saved.access_token && saved.domain_user_id) {
      setSession(saved);
    } else if (saved) {
      // Stale/incomplete session — clear it
      clearSession();
    }
  }, []);

  // Fetch diary
  const loadDiary = useCallback(async (sess: MfpSession, date: string) => {
    if (!sess.domain_user_id) {
      clearSession();
      setSession(null);
      setError("Invalid session. Please sign in again.");
      return;
    }
    setIsFetching(true);
    setError(null);
    try {
      let data = await fetchFoodLog(sess.access_token, sess.domain_user_id, date);

      // If session expired, try refreshing ONCE
      if (data.error === "session_expired" && sess.refresh_token) {
        const refreshed = await refreshMfpToken(sess.refresh_token);
        if (refreshed.access_token) {
          const newSess: MfpSession = {
            ...sess,
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token || sess.refresh_token,
            expires_at: Date.now() + (refreshed.expires_in || 3600) * 1000,
          };
          saveSession(newSess);
          data = await fetchFoodLog(newSess.access_token, sess.domain_user_id, date);
          // Only update session state if diary succeeded (prevents loop)
          if (!data.error || data.error !== "session_expired") {
            setSession(newSess);
          } else {
            // Refresh worked but diary still fails — force re-login
            clearSession();
            setSession(null);
            setError("Session is invalid. Please sign in again.");
            setIsFetching(false);
            return;
          }
        } else {
          clearSession();
          setSession(null);
          setError("Session expired. Please sign in again.");
          setIsFetching(false);
          return;
        }
      }

      if (data.error) {
        setError(data.error);
      } else {
        setFoodLog(data);
      }
    } catch {
      setError("Failed to load food log.");
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    if (session) loadDiary(session, selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, selectedDate]);

  const handleLogin = async (email: string, password: string) => {
    setIsConnecting(true);
    setError(null);
    try {
      const result = await loginToMfp(email, password);
      if (result.error) {
        setError(result.error);
      } else if (result.access_token) {
        const sess: MfpSession = {
          access_token: result.access_token,
          refresh_token: result.refresh_token,
          domain_user_id: result.domain_user_id,
          display_name: result.display_name,
          email: result.email,
          expires_at: Date.now() + (result.expires_in || 3600) * 1000,
        };
        setSession(sess);
        saveSession(sess);
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    clearSession();
    setSession(null);
    setFoodLog(null);
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
          <h1 className="text-xl font-semibold tracking-tight">MFP Connect</h1>
          <div className="ml-auto flex items-center gap-4">
            <ConnectionStatus connected={!!session} />
            {session && (
              <span className="text-sm text-muted-foreground hidden sm:inline">{session.display_name}</span>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-5xl">
        {!session ? (
          <MfpLoginForm onLogin={handleLogin} isLoading={isConnecting} error={error} />
        ) : (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Your Food Log</h2>
                {foodLog && (
                  <p className="text-muted-foreground mt-1">
                    {foodLog.date} &middot; {foodLog.totals.calories} calories
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-auto" />
                <Button variant="outline" size="sm" onClick={() => loadDiary(session, selectedDate)} disabled={isFetching}>
                  {isFetching ? "Loading..." : "Refresh"}
                </Button>
                <button onClick={handleDisconnect} className="text-sm text-muted-foreground hover:text-destructive transition-colors">
                  Disconnect
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">{error}</div>
            )}

            {isFetching && !foodLog ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : foodLog ? (
              <FoodLogTable data={foodLog} />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
