// Generate a weekly review for a client based on the last 2 weeks of:
//  - self-reported weekly check-ins
//  - workout sessions + set logs (adherence + progression)
//  - nutrition logs (macro adherence)
//  - the active nutrition + training plan and intake context
//
// Returns a draft voice memo, client-facing bullets, structured suggested
// adjustments (macro deltas + training notes) and a snapshot of the
// objective insights computed server-side.
//
// Ported from supabase/functions/generate-weekly-review/index.ts

import { z } from "zod";
import { HttpError, requireCoach, requireOwnClient, serviceEndpoint } from "../../_lib/fn.js";
import type { SqlClient } from "../../_lib/db.js";

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
    not_progressing: string[];
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

const bodySchema = z.object({
  clientId: z.string().uuid(),
  weekStart: z.string().optional(),
});

const PLAN_JSON_SQL = `jsonb_build_object(
  'id', wp.id,
  'name', wp.name,
  'description', wp.description,
  'frequency_per_week', wp.frequency_per_week,
  'workout_plan_days', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', wpd.id,
        'day_index', wpd.day_index,
        'name', wpd.name,
        'workout_plan_exercises', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'id', wpe.id,
              'order_index', wpe.order_index,
              'sets_reps', wpe.sets_reps,
              'notes', wpe.notes,
              'exercises', jsonb_build_object(
                'name', ex.name,
                'muscle_group', ex.muscle_group,
                'equipment', ex.equipment
              )
            )), '[]'::jsonb)
          FROM public.workout_plan_exercises wpe
          JOIN public.exercises ex ON ex.id = wpe.exercise_id
          WHERE wpe.day_id = wpd.id
        )
      ) ORDER BY wpd.day_index), '[]'::jsonb)
    FROM public.workout_plan_days wpd
    WHERE wpd.plan_id = wp.id
  )
)`;

export default serviceEndpoint({ auth: "user" }, async ({ req, sql, user }) => {
  if (!user) throw new HttpError(401, "Unauthorized");

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, "clientId required");
  }
  const { clientId, weekStart } = parsed.data;

  await requireCoach(sql, user);
  await requireOwnClient(sql, user, clientId);

  const today = startOfDay(new Date());
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const since = ymd(fourteenDaysAgo);

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
    sql.query<Record<string, any>>(
      `SELECT * FROM public.onboarding_responses WHERE user_id = $1`,
      [clientId],
    ),
    sql.query<Record<string, any>>(
      `SELECT * FROM public.nutrition_plans WHERE client_id = $1`,
      [clientId],
    ),
    sql.query<Record<string, any>>(
      `SELECT cwa.*, ${PLAN_JSON_SQL} AS plan
         FROM public.client_workout_assignments cwa
         JOIN public.workout_plans wp ON wp.id = cwa.plan_id
        WHERE cwa.client_id = $1 AND cwa.is_active = true`,
      [clientId],
    ),
    sql.query<Record<string, any>>(
      `SELECT * FROM public.weekly_checkins
        WHERE client_id = $1
        ORDER BY week_start DESC
        LIMIT 4`,
      [clientId],
    ),
    sql.query<Record<string, any>>(
      `SELECT
         ws.id, ws.plan_id, ws.day_id, ws.started_at, ws.completed_at, ws.scheduled_date,
         (
           SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'set_number', wsl.set_number,
               'reps', wsl.reps,
               'weight_kg', wsl.weight_kg,
               'plan_exercise_id', wsl.plan_exercise_id,
               'created_at', wsl.created_at
             )), '[]'::jsonb)
           FROM public.workout_set_logs wsl
           WHERE wsl.session_id = ws.id
         ) AS workout_set_logs
       FROM public.workout_sessions ws
       WHERE ws.client_id = $1 AND ws.started_at >= $2
       ORDER BY ws.started_at DESC`,
      [clientId, fourteenDaysAgo.toISOString()],
    ),
    sql.query<Record<string, any>>(
      `SELECT log_date, calories, protein_g, carbs_g, fat_g
         FROM public.cronometer_nutrition_logs
        WHERE client_id = $1 AND log_date >= $2::date
        ORDER BY log_date DESC`,
      [clientId, since],
    ),
    sql.query<Record<string, any>>(
      `SELECT client_actions, client_attention, client_positive
         FROM public.coach_messages
        WHERE client_id = $1
        LIMIT 1`,
      [clientId],
    ),
    sql.query<Record<string, any>>(
      `SELECT * FROM public.client_goals
        WHERE client_id = $1 AND is_active = true
        ORDER BY created_at DESC LIMIT 1`,
      [clientId],
    ),
  ]);

  const intake = intakeRes.rows[0] ?? null;
  const nutritionPlan = nutritionPlanRes.rows[0] ?? null;
  const assignments = assignRes.rows;
  const checkins = checkinsRes.rows;
  const sessions = sessionsRes.rows;
  const nutritionLogs = nutritionLogsRes.rows;
  const prevMessage = previousMessageRes.rows;
  const activeGoal = activeGoalRes.rows[0] ?? null;

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
  const notProgressing: string[] = [];
  for (const [exId, sets] of Object.entries(setsByEx)) {
    const recent = sets.filter((s) => s.when >= sevenDaysAgo);
    const prior = sets.filter((s) => s.when < sevenDaysAgo);
    if (recent.length === 0 || prior.length === 0) continue;
    const recentBest = Math.max(...recent.map((s) => s.weight * s.reps));
    const priorBest = Math.max(...prior.map((s) => s.weight * s.reps));
    if (priorBest === 0) continue;
    const delta = ((recentBest - priorBest) / priorBest) * 100;
    const name = exNameById[exId] ?? "Onbekend";
    if (delta >= 5) {
      improved++;
      notable.push({ name, change: `+${delta.toFixed(0)}% volume` });
    } else if (delta <= -5) {
      regressed++;
      notable.push({ name, change: `${delta.toFixed(0)}% volume` });
    } else {
      // Between -5% and +5% — logged both weeks but no meaningful progression.
      notProgressing.push(name);
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
      not_progressing: notProgressing,
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

  // ACTIVE GOAL — single source of truth. Overrides any onboarding goal.
  parts.push("=== ACTIEF DOEL (HEILIG — gebruik deze waardes, NIET de oorspronkelijke intake-goal) ===");
  if (activeGoal) {
    const labelMap: Record<string, string> = {
      cut: "Vet verliezen / cutten",
      bulk: "Spiermassa / bulken",
      maintain: "Onderhoud",
      custom: "Aangepast doel",
    };
    parts.push(
      [
        `Doeltype: ${labelMap[activeGoal.goal_type] ?? activeGoal.goal_type}`,
        activeGoal.goal_label && `Doelomschrijving: ${activeGoal.goal_label}`,
        activeGoal.goal_weight_kg != null && `Streefgewicht: ${activeGoal.goal_weight_kg} kg`,
        activeGoal.starting_weight_kg != null && `Startgewicht: ${activeGoal.starting_weight_kg} kg`,
        activeGoal.target_date && `Streefdatum: ${activeGoal.target_date}`,
        activeGoal.maintenance_calories != null && `Onderhoudscalorieën (coach-opgegeven): ${activeGoal.maintenance_calories} kcal`,
        activeGoal.activity_level && `Activiteitsniveau: ${activeGoal.activity_level}`,
        activeGoal.weekly_drift_tolerance_kg != null && `Wekelijkse drift-tolerantie: ±${activeGoal.weekly_drift_tolerance_kg} kg`,
        activeGoal.notes && `Notities coach: ${activeGoal.notes}`,
        `Doel laatst bijgewerkt: ${activeGoal.updated_at ?? activeGoal.created_at}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    parts.push(
      "BELANGRIJK: baseer ALLE adviezen (calorieën, gewicht, training) op dit ACTIEVE doel. Als het actieve doel afwijkt van het oorspronkelijke intake-doel, volg ALTIJD het actieve doel.",
    );
  } else {
    parts.push("(geen actief client_goals record — val terug op intake)");
  }

  parts.push("\n=== KLANT INTAKE (context — kan verouderd zijn) ===");
  if (intake) {
    parts.push(
      [
        intake.full_name && `Naam: ${intake.full_name}`,
        intake.primary_goal && `Oorspronkelijk intake-doel (mogelijk verouderd): ${intake.primary_goal}`,
        intake.target_outcome && `Oorspronkelijk gewenst resultaat: ${intake.target_outcome}`,
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
    `Progressie: ${improved} oefeningen verbeterd, ${regressed} achteruit, ${notProgressing.length} zonder progressie. Top: ${notableTop.map((n) => `${n.name} (${n.change})`).join("; ") || "geen significant"}`,
  );
  if (notProgressing.length > 0) {
    parts.push(
      `Oefeningen zonder progressie (wel gelogd beide weken, maar volume binnen ±5%): ${notProgressing.join(", ")}. BENOEM DEZE OEFENINGEN MET NAAM in de spraakmemo als je zegt hoeveel oefeningen geen progressie toonden.`,
    );
  }

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
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
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
      throw new HttpError(429, "Rate limit bereikt, probeer het zo opnieuw.");
    }
    throw new HttpError(500, "AI generatie mislukt");
  }

  const aiData = await aiResp.json();
  const toolUse = (aiData.content ?? []).find((b: any) => b.type === "tool_use");
  if (!toolUse) {
    console.error("No tool use", JSON.stringify(aiData));
    throw new HttpError(500, "Onverwacht AI antwoord");
  }
  const args = toolUse.input ?? {};

  return {
    voice_memo: args.voice_memo ?? "",
    client_positive: Array.isArray(args.client_positive) ? args.client_positive : [],
    client_attention: Array.isArray(args.client_attention) ? args.client_attention : [],
    client_actions: Array.isArray(args.client_actions) ? args.client_actions : [],
    suggested_adjustments: args.suggested_adjustments ?? {},
    insights,
  };
});
