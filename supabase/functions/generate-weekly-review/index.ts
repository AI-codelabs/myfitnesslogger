// Generate a weekly review for a client based on the last 2 weeks of:
//  - self-reported weekly check-ins
//  - workout sessions + set logs (adherence + progression)
//  - nutrition logs (macro adherence)
//  - the active nutrition + training plan and intake context
//
// Returns a draft voice memo, client-facing bullets, structured suggested
// adjustments (macro deltas + training notes) and a snapshot of the
// objective insights computed server-side.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Je bent een ervaren, persoonlijke online fitness coach. Je schrijft een wekelijkse review voor een klant op basis van:
1) hun zelf-ingevulde wekelijkse check-in
2) objectieve trainingsdata (volledig én gedeeltelijk afgemaakte sessies, progressie in gewicht/reps)
3) objectieve voedingsdata — alleen de dagen die de klant écht gelogd heeft (NOOIT delen door 7 als er minder dagen gelogd zijn)
4) het oorspronkelijke intakeformulier en huidige plan

JOUW TOON:
- Coachend en menselijk, niet robotachtig of veroordelend.
- Ondersteunend maar eerlijk. Daag de klant uit waar nodig, zonder belerend te worden.
- Benoem patronen helder en geef praktische volgende stappen.
- Voorbeeld — NIET: "Je hebt je vet-target overschreden." WEL: "Je vetinname lag deze week structureel boven target. Dat hoeft niet meteen een probleem te zijn, maar het is goed om te kijken waar die extra vetten vandaan komen zodat we op koers blijven richting je doel."

KWALITEIT VAN DATA (CRUCIAAL):
- Gebruik ALLEEN de cijfers die in de input staan. Verzin nooit waardes.
- Voor voedingsgemiddelden: gebruik exact de "avg_*" velden. Die zijn al berekend over alleen de gelogde dagen. Deel die NOOIT opnieuw door 7.
- Voor workouts: er zijn drie statussen — volledig afgemaakt (alle oefeningen gelogd), gedeeltelijk afgemaakt (50%+ oefeningen gelogd) en niet afgemaakt (<50%). Behandel gedeeltelijk afgemaakte sessies als "grotendeels gedaan" — geen reden om de klant af te branden als 7/8 oefeningen zijn gelogd.
- Als data ontbreekt (bv. weinig dagen gelogd), benoem dat eerlijk en pas je advies aan.

JE OUTPUT BESTAAT UIT DRIE DELEN:

1. SPRAAKMEMO (coachend, persoonlijk, voor de coach om voor te lezen via WhatsApp)
- Lopende tekst, GEEN bulletpoints, GEEN kopjes, GEEN emoji.
- Begin met een warme maar directe terugblik op de week.
- Verwijs CONCREET naar cijfers: aantal volledige + gedeeltelijke sessies, gemiddelde kcal over X gelogde dagen, eiwit %, gewichtsverandering, RPE.
- Eindig met de concrete actie voor komende week — en SOMS (niet altijd) met een coachende reflectievraag, bv. "Wat denk je dat de hogere kcal-inname dit weekend veroorzaakte?" of "Wat zou je komende week graag willen verbeteren?".

2. KLANT BULLETPOINTS (zichtbaar op het dashboard)
- positive: 2-4 punten over wat goed ging (data-onderbouwd, supportive toon)
- attention: 2-4 punten — formuleer als "iets om naar te kijken", niet als verwijt
- actions: 3-5 concrete actiepunten. Bij ongeveer één op de drie reviews mag het laatste action-item een open coachende vraag zijn.

3. SUGGESTED_ADJUSTMENTS (voor de coach)
- nutrition: deltas t.o.v. huidig plan + rationale. 0 = geen aanpassing. Realistisch: meestal +/- 100-300 kcal of +/- 10-30g.
- training: max 4 concrete items per dag of oefening.

REGELS:
- Schrijf ALLES in het Nederlands.
- Altijd data-gedreven: noem concrete waardes uit de input.
- Geen herhaling tussen de drie outputs.`;

interface Insights {
  week_start: string;
  workouts: {
    sessions_completed: number;
    sessions_partial: number;
    sessions_not_completed: number;
    sessions_planned: number;
    adherence_pct: number;
  };
  progression: {
    exercises_improved: number;
    exercises_regressed: number;
    notable: Array<{ name: string; change: string }>;
  };
  nutrition: {
    days_logged: number;
    avg_calories: number;
    avg_protein_g: number;
    avg_carbs_g: number;
    avg_fat_g: number;
    target_calories: number | null;
    target_protein_g: number | null;
    target_carbs_g: number | null;
    target_fat_g: number | null;
    calorie_adherence_pct: number | null;
    protein_adherence_pct: number | null;
  };
  body: {
    weight_kg_current: number | null;
    weight_kg_previous: number | null;
    weight_change_kg: number | null;
  };
}

function pct(actual: number, target: number | null | undefined): number | null {
  if (!target || target <= 0) return null;
  return Math.round((actual / target) * 1000) / 10;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, weekStart } = await req.json();
    if (!clientId || typeof clientId !== "string") {
      return new Response(JSON.stringify({ error: "clientId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SERVICE_KEY },
    });
    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userData = await userResp.json();
    const coachId = userData.id;

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    };

    // Verify coach-client relationship
    const relRes = await fetch(
      `${SUPABASE_URL}/rest/v1/invitations?coach_id=eq.${coachId}&accepted_user_id=eq.${clientId}&select=id`,
      { headers },
    );
    const rel = await relRes.json();
    if (!Array.isArray(rel) || rel.length === 0) {
      return new Response(JSON.stringify({ error: "Not your client" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = startOfDay(new Date());
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const since = ymd(fourteenDaysAgo);

    // Fetch everything we need in parallel
    const [
      intakeRes,
      nutritionPlanRes,
      assignRes,
      checkinsRes,
      sessionsRes,
      nutritionLogsRes,
      previousMessageRes,
      activeGoalRes,
    ] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/onboarding_responses?user_id=eq.${clientId}&select=*`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/nutrition_plans?client_id=eq.${clientId}&select=*`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/client_workout_assignments?client_id=eq.${clientId}&is_active=eq.true&select=*,plan:workout_plans(name,description,frequency_per_week,workout_plan_days(id,day_index,name,workout_plan_exercises(id,order_index,sets_reps,notes,exercises(name,muscle_group,equipment))))`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/weekly_checkins?client_id=eq.${clientId}&order=week_start.desc&limit=4&select=*`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/workout_sessions?client_id=eq.${clientId}&started_at=gte.${fourteenDaysAgo.toISOString()}&order=started_at.desc&select=id,plan_id,day_id,started_at,completed_at,scheduled_date,workout_set_logs(set_number,reps,weight_kg,plan_exercise_id,created_at)`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/cronometer_nutrition_logs?client_id=eq.${clientId}&log_date=gte.${since}&order=log_date.desc&select=log_date,calories,protein_g,carbs_g,fat_g`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/coach_messages?client_id=eq.${clientId}&select=client_actions,client_attention,client_positive&limit=1`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/client_goals?client_id=eq.${clientId}&is_active=eq.true&order=created_at.desc&limit=1&select=*`,
        { headers },
      ),
    ]);

    const intakeArr = await intakeRes.json();
    const nutritionArr = await nutritionPlanRes.json();
    const assignments = await assignRes.json();
    const checkins = await checkinsRes.json();
    const sessions = await sessionsRes.json();
    const nutritionLogs = await nutritionLogsRes.json();
    const prevMessage = await previousMessageRes.json();
    const activeGoalArr = await activeGoalRes.json();
    const activeGoal = Array.isArray(activeGoalArr) && activeGoalArr[0] ? activeGoalArr[0] : null;


    const intake = Array.isArray(intakeArr) && intakeArr[0] ? intakeArr[0] : null;
    const nutritionPlan = Array.isArray(nutritionArr) && nutritionArr[0] ? nutritionArr[0] : null;
    const planDetails = (nutritionPlan?.details ?? {}) as Record<string, number>;

    // ---------- compute INSIGHTS ----------
    const targetCals = Number(planDetails.calories) || null;
    const targetProtein = Number(planDetails.protein_g) || null;
    const targetCarbs = Number(planDetails.carbs_g) || null;
    const targetFat = Number(planDetails.fat_g) || null;

    // last 7 logged days
    const recentLogs = (nutritionLogs as any[]).slice(0, 7);
    const avgCals = avg(recentLogs.map((l) => Number(l.calories) || 0));
    const avgProtein = avg(recentLogs.map((l) => Number(l.protein_g) || 0));
    const avgCarbs = avg(recentLogs.map((l) => Number(l.carbs_g) || 0));
    const avgFat = avg(recentLogs.map((l) => Number(l.fat_g) || 0));

    // workouts in last 7 days vs planned per week (use first active assignment)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const firstAssign = Array.isArray(assignments) ? assignments[0] : null;
    const planned =
      firstAssign?.days?.length ??
      firstAssign?.plan?.frequency_per_week ??
      intake?.train_freq_target ??
      0;

    // Map plan day_id -> expected exercise count, for partial-completion logic
    const expectedExByDay: Record<string, number> = {};
    if (firstAssign?.plan?.workout_plan_days) {
      for (const day of firstAssign.plan.workout_plan_days) {
        expectedExByDay[day.id] = (day.workout_plan_exercises ?? []).length;
      }
    }

    // Classify each recent session: complete (100%), partial (>=50%), not (<50%)
    const recentSessionsAll = (sessions as any[]).filter(
      (s) => new Date(s.started_at) >= sevenDaysAgo,
    );
    let sessionsCompleted = 0;
    let sessionsPartial = 0;
    let sessionsNot = 0;
    for (const s of recentSessionsAll) {
      const expected = expectedExByDay[s.day_id] ?? 0;
      const logged = new Set(
        (s.workout_set_logs ?? [])
          .map((l: any) => l.plan_exercise_id)
          .filter(Boolean),
      ).size;
      if (expected <= 0) {
        // fall back: treat any session with completed_at as fully completed
        if (s.completed_at) sessionsCompleted++;
        else if (logged > 0) sessionsPartial++;
        continue;
      }
      const ratio = logged / expected;
      if (ratio >= 0.999) sessionsCompleted++;
      else if (ratio >= 0.5) sessionsPartial++;
      else if (logged > 0) sessionsNot++;
    }
    const sessionsCountedTowardAdherence = sessionsCompleted + sessionsPartial;

    // progression: per plan_exercise_id compare best set this week vs previous week
    const setsByEx: Record<string, Array<{ when: Date; weight: number; reps: number }>> = {};
    const exNameById: Record<string, string> = {};
    if (firstAssign?.plan?.workout_plan_days) {
      for (const day of firstAssign.plan.workout_plan_days) {
        for (const ex of day.workout_plan_exercises ?? []) {
          exNameById[ex.id] = ex.exercises?.name ?? "?";
        }
      }
    }
    for (const sess of sessions as any[]) {
      for (const log of sess.workout_set_logs ?? []) {
        const arr = (setsByEx[log.plan_exercise_id] ??= []);
        arr.push({
          when: new Date(sess.started_at),
          weight: Number(log.weight_kg) || 0,
          reps: Number(log.reps) || 0,
        });
      }
    }

    let improved = 0;
    let regressed = 0;
    const notable: Array<{ name: string; change: string }> = [];
    for (const [exId, sets] of Object.entries(setsByEx)) {
      const recent = sets.filter((s) => s.when >= sevenDaysAgo);
      const prior = sets.filter((s) => s.when < sevenDaysAgo);
      if (recent.length === 0 || prior.length === 0) continue;
      const recentBest = Math.max(...recent.map((s) => s.weight * s.reps));
      const priorBest = Math.max(...prior.map((s) => s.weight * s.reps));
      if (priorBest === 0) continue;
      const delta = ((recentBest - priorBest) / priorBest) * 100;
      if (delta >= 5) {
        improved++;
        notable.push({
          name: exNameById[exId] ?? "Onbekend",
          change: `+${delta.toFixed(0)}% volume`,
        });
      } else if (delta <= -5) {
        regressed++;
        notable.push({
          name: exNameById[exId] ?? "Onbekend",
          change: `${delta.toFixed(0)}% volume`,
        });
      }
    }
    notable.sort((a, b) => Math.abs(parseFloat(b.change)) - Math.abs(parseFloat(a.change)));
    const notableTop = notable.slice(0, 5);

    // body weight change from check-ins
    const latestCheckin = checkins[0] ?? null;
    const previousCheckin = checkins[1] ?? null;
    const wNow = latestCheckin?.weight_kg ? Number(latestCheckin.weight_kg) : null;
    const wPrev = previousCheckin?.weight_kg ? Number(previousCheckin.weight_kg) : null;
    const wChange = wNow !== null && wPrev !== null ? Math.round((wNow - wPrev) * 10) / 10 : null;

    const insights: Insights = {
      week_start: weekStart || latestCheckin?.week_start || ymd(today),
      workouts: {
        sessions_completed: sessionsCompleted,
        sessions_partial: sessionsPartial,
        sessions_not_completed: sessionsNot,
        sessions_planned: Number(planned) || 0,
        adherence_pct:
          planned > 0
            ? Math.round((sessionsCountedTowardAdherence / Number(planned)) * 100)
            : 0,
      },
      progression: {
        exercises_improved: improved,
        exercises_regressed: regressed,
        notable: notableTop,
      },
      nutrition: {
        days_logged: recentLogs.length,
        avg_calories: avgCals,
        avg_protein_g: avgProtein,
        avg_carbs_g: avgCarbs,
        avg_fat_g: avgFat,
        target_calories: targetCals,
        target_protein_g: targetProtein,
        target_carbs_g: targetCarbs,
        target_fat_g: targetFat,
        calorie_adherence_pct: pct(avgCals, targetCals),
        protein_adherence_pct: pct(avgProtein, targetProtein),
      },
      body: {
        weight_kg_current: wNow,
        weight_kg_previous: wPrev,
        weight_change_kg: wChange,
      },
    };

    // ---------- build user prompt ----------
    const parts: string[] = [];
    parts.push("=== KLANT INTAKE (samenvatting) ===");
    if (intake) {
      parts.push(
        [
          intake.full_name && `Naam: ${intake.full_name}`,
          intake.primary_goal && `Doel: ${intake.primary_goal}`,
          intake.target_outcome && `Gewenst resultaat: ${intake.target_outcome}`,
          intake.train_freq_target && `Target frequentie: ${intake.train_freq_target}x/week`,
          intake.injuries && `Blessures: ${intake.injuries}`,
          intake.coach_expectations && `Verwachtingen: ${intake.coach_expectations}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } else {
      parts.push("(geen intake)");
    }

    parts.push("\n=== HUIDIG VOEDINGSPLAN ===");
    if (nutritionPlan) {
      parts.push(
        [
          targetCals && `Calorieën target: ${targetCals} kcal`,
          targetProtein && `Eiwit target: ${targetProtein} g`,
          targetCarbs && `Koolhydraten target: ${targetCarbs} g`,
          targetFat && `Vet target: ${targetFat} g`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } else {
      parts.push("(geen voedingsplan)");
    }

    parts.push("\n=== HUIDIG TRAININGSSCHEMA ===");
    if (firstAssign?.plan) {
      parts.push(
        `Plan: ${firstAssign.plan.name}${firstAssign.days ? ` — dagen: ${(firstAssign.days as string[]).join(", ")}` : ""} — frequentie: ${firstAssign.plan.frequency_per_week ?? "?"}x/week`,
      );
      for (const d of firstAssign.plan.workout_plan_days ?? []) {
        const exList = (d.workout_plan_exercises ?? [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((e: any) => `  - ${e.exercises?.name} (${e.sets_reps ?? "?"})`)
          .join("\n");
        parts.push(`Dag ${d.day_index} — ${d.name}:\n${exList}`);
      }
    } else {
      parts.push("(geen actief schema)");
    }

    parts.push("\n=== LAATSTE WEKELIJKSE CHECK-IN (zelf-rapportage) ===");
    if (latestCheckin) {
      const c = latestCheckin;
      parts.push(
        [
          `Week: ${c.week_start}`,
          c.training_count && `Trainingen: ${c.training_count}`,
          c.intensity_rpe != null && `RPE intensiteit: ${c.intensity_rpe}/5`,
          c.progression != null && `Gevoel progressie: ${c.progression}/5`,
          c.nutrition_stars != null && `Voeding-adherence (zelf): ${c.nutrition_stars}/5`,
          c.nutrition_deviations && `Afwijkingen: ${c.nutrition_deviations}`,
          c.cravings && `Cravings/energie: ${c.cravings}`,
          c.sleep_cycle && `Slaap: ${c.sleep_cycle}`,
          c.energy != null && `Energie: ${c.energy}/5`,
          c.soreness != null && `Herstel/spierpijn: ${c.soreness}/5`,
          c.weight_kg && `Gewicht: ${c.weight_kg} kg`,
          c.measurements && `Metingen: ${c.measurements}`,
          c.feeling != null && `Mentaal gevoel: ${c.feeling}/5`,
          c.structure_planning && `Structuur/planning: ${c.structure_planning}`,
          c.progress_feeling && `Progressiegevoel: ${c.progress_feeling}`,
          c.obstacles && `Belemmeringen: ${c.obstacles}`,
          c.supplements_consistency != null && `Supplementen: ${c.supplements_consistency}/5`,
          c.hydration != null && `Hydratatie: ${c.hydration}/5`,
          c.other_notes && `Overig: ${c.other_notes}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } else {
      parts.push("(geen check-in deze week)");
    }

    if (previousCheckin) {
      parts.push("\n=== VORIGE CHECK-IN (week ervoor) ===");
      const c = previousCheckin;
      parts.push(
        [
          `Week: ${c.week_start}`,
          c.weight_kg && `Gewicht: ${c.weight_kg} kg`,
          c.feeling != null && `Mentaal: ${c.feeling}/5`,
          c.energy != null && `Energie: ${c.energy}/5`,
          c.nutrition_stars != null && `Voeding: ${c.nutrition_stars}/5`,
          c.training_count && `Trainingen: ${c.training_count}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    parts.push("\n=== OBJECTIEVE TRAININGSDATA (laatste 7 dagen) ===");
    parts.push(
      `Volledig afgemaakte sessies: ${insights.workouts.sessions_completed}`,
    );
    parts.push(
      `Gedeeltelijk afgemaakte sessies (50%+ oefeningen gelogd, beschouw als grotendeels gedaan): ${insights.workouts.sessions_partial}`,
    );
    parts.push(
      `Niet afgemaakte sessies (<50% gelogd): ${insights.workouts.sessions_not_completed}`,
    );
    parts.push(
      `Geplande sessies per week: ${insights.workouts.sessions_planned}. Adherence (volledig + gedeeltelijk): ${insights.workouts.adherence_pct}%.`,
    );
    parts.push(
      `Progressie: ${improved} oefeningen verbeterd, ${regressed} achteruit. Top: ${notableTop.map((n) => `${n.name} (${n.change})`).join("; ") || "geen significant"}`,
    );

    parts.push("\n=== OBJECTIEVE VOEDINGSDATA ===");
    if (recentLogs.length === 0) {
      parts.push("Geen voedingslogs deze periode (Cronometer niet gesynchroniseerd of klant logt niet).");
    } else {
      parts.push(
        [
          `Dagen daadwerkelijk gelogd: ${recentLogs.length} (gemiddelden hieronder zijn berekend over deze ${recentLogs.length} dag(en), NIET over 7).`,
          `Gemiddelde calorieën: ${avgCals} kcal (target ${targetCals ?? "?"}, ${insights.nutrition.calorie_adherence_pct ?? "?"}%)`,
          `Gemiddeld eiwit: ${avgProtein} g (target ${targetProtein ?? "?"}, ${insights.nutrition.protein_adherence_pct ?? "?"}%)`,
          `Gemiddelde koolhydraten: ${avgCarbs} g (target ${targetCarbs ?? "?"})`,
          `Gemiddeld vet: ${avgFat} g (target ${targetFat ?? "?"})`,
        ].join("\n"),
      );
    }

    if (wChange !== null) {
      parts.push(
        `\n=== GEWICHTSVERSCHIL ===\nVan ${wPrev} kg → ${wNow} kg (${wChange > 0 ? "+" : ""}${wChange} kg)`,
      );
    }

    if (Array.isArray(prevMessage) && prevMessage[0]) {
      parts.push("\n=== VORIGE COACH BERICHTEN (context) ===");
      const m = prevMessage[0];
      if (m.client_actions?.length) parts.push(`Vorige actiepunten: ${m.client_actions.join("; ")}`);
    }

    parts.push(
      "\nGenereer nu de wekelijkse review. Gebruik de tool `coach_weekly_review` om je antwoord te structureren.",
    );

    const userPrompt = parts.join("\n");

    // ---------- AI call ----------
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        tools: [
          {
            name: "coach_weekly_review",
            description: "Gestructureerde wekelijkse review voor de klant.",
            input_schema: {
              type: "object",
              properties: {
                voice_memo: {
                  type: "string",
                  description: "Volledige spraakmemo tekst in het Nederlands.",
                },
                client_positive: {
                  type: "array",
                  items: { type: "string" },
                  description: "2-4 positieve, data-onderbouwde punten.",
                },
                client_attention: {
                  type: "array",
                  items: { type: "string" },
                  description: "2-4 aandachtspunten.",
                },
                client_actions: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 concrete actiepunten voor komende week.",
                },
                suggested_adjustments: {
                  type: "object",
                  properties: {
                    nutrition: {
                      type: "object",
                      properties: {
                        calories_delta: { type: "number" },
                        protein_delta: { type: "number" },
                        carbs_delta: { type: "number" },
                        fat_delta: { type: "number" },
                        rationale: { type: "string" },
                      },
                      required: [
                        "calories_delta",
                        "protein_delta",
                        "carbs_delta",
                        "fat_delta",
                        "rationale",
                      ],
                    },
                    training: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          focus: { type: "string", description: "Welke dag of oefening" },
                          change: { type: "string", description: "De voorgestelde aanpassing" },
                          rationale: { type: "string" },
                        },
                        required: ["focus", "change", "rationale"],
                      },
                    },
                  },
                  required: ["nutrition", "training"],
                },
              },
              required: [
                "voice_memo",
                "client_positive",
                "client_attention",
                "client_actions",
                "suggested_adjustments",
              ],
            },
          },
        ],
        tool_choice: { type: "tool", name: "coach_weekly_review" },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("Anthropic error", aiResp.status, txt);
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit bereikt, probeer het zo opnieuw." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "AI generatie mislukt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolUse = (aiData.content ?? []).find((b: any) => b.type === "tool_use");
    if (!toolUse) {
      console.error("No tool use", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "Onverwacht AI antwoord" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = toolUse.input ?? {};

    return new Response(
      JSON.stringify({
        voice_memo: args.voice_memo ?? "",
        client_positive: Array.isArray(args.client_positive) ? args.client_positive : [],
        client_attention: Array.isArray(args.client_attention) ? args.client_attention : [],
        client_actions: Array.isArray(args.client_actions) ? args.client_actions : [],
        suggested_adjustments: args.suggested_adjustments ?? {},
        insights,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-weekly-review error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
