// Generate a personalized Dutch start message for a client based on intake,
// nutrition plan and assigned workout schedule. Returns a voice-memo script
// (coach-only) and structured client bullet points.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Je bent een high-level online fitness coach. Je schrijft persoonlijke startberichten voor nieuwe klanten op basis van hun intakeformulier, voedingsschema en trainingsschema.

Je output bestaat uit TWEE delen:

1. SPRAAKMEMO (coachend, direct, positief maar scherp)
- Wordt door de coach voorgelezen en via WhatsApp naar de klant gestuurd.
- Lange, vloeiende lopende tekst. Geen bulletpoints, geen kopjes, geen emoji's.
- Begin met "Dit is je startpunt..." of een vergelijkbare directe opening.
- Verwijs naar de data van de klant waar het RELEVANT is (doel, trainingsfrequentie, kcal, macro's, focuspunten), maar SOM NIET de basisstats op (leeftijd, lengte, gewicht) — de klant kent zijn eigen cijfers.
- Leg keuzes uit (waarom upper/lower verdeling, waarom carbs omhoog, etc.).
- Eindig met praktische volgende stappen en check-in moment.

2. KLANT BULLETPOINTS (zichtbaar op het dashboard van de klant)
- Drie aparte arrays van korte, scherpe punten:
  - positive: dingen die goed gaan / sterke startpositie
  - attention: aandachtspunten op basis van de data
  - actions: 3-5 concrete actiepunten voor deze week
- Elke bullet is 1 zin, krachtig en concreet.

REGELS:
- Schrijf ALLES in het Nederlands.
- Altijd data-gedreven: verwijs naar concrete waardes uit de input WAAR ZE INZICHT TOEVOEGEN. Herhaal NOOIT gewoon "je weegt 75 kg en bent 1,85 m" — dat weet de klant al. Gebruik zulke cijfers alleen impliciet in advies (bv. "met jouw onderhoud rond de 2600 kcal…").
- Coachend, niet betuttelend.
- Geen algemene adviezen zonder link naar de data van de klant.
- Geen herhaling tussen spraakmemo en bulletpoints — bulletpoints vatten de essentie samen.
- Geef max 5 actiepunten.`;

interface ClientContext {
  intake: Record<string, unknown> | null;
  nutrition: Record<string, unknown> | null;
  assignments: Array<Record<string, unknown>>;
  activeGoal: Record<string, unknown> | null;
}


function buildUserPrompt(ctx: ClientContext): string {
  const parts: string[] = [];

  // ACTIVE GOAL — must override any older onboarding goal
  parts.push("=== ACTIEF DOEL (gebruik deze — overrulet intake) ===");
  if (ctx.activeGoal) {
    const g = ctx.activeGoal;
    const labelMap: Record<string, string> = {
      cut: "Vet verliezen / cutten",
      bulk: "Spiermassa / bulken",
      maintain: "Onderhoud",
      custom: "Aangepast doel",
    };
    parts.push(
      [
        `Doeltype: ${labelMap[String(g.goal_type)] ?? g.goal_type}`,
        g.goal_label && `Doelomschrijving: ${g.goal_label}`,
        g.goal_weight_kg != null && `Streefgewicht: ${g.goal_weight_kg} kg`,
        g.starting_weight_kg != null && `Startgewicht: ${g.starting_weight_kg} kg`,
        g.target_date && `Streefdatum: ${g.target_date}`,
        g.maintenance_calories != null && `Onderhoudscalorieën: ${g.maintenance_calories} kcal`,
        g.activity_level && `Activiteitsniveau: ${g.activity_level}`,
        g.notes && `Notities coach: ${g.notes}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } else {
    parts.push("(geen actief doel ingesteld — val terug op intake)");
  }

  parts.push("\n=== INTAKE FORMULIER (context — kan verouderd zijn) ===");

  if (ctx.intake) {
    const i = ctx.intake;
    const fmt = (k: string, v: unknown) =>
      v !== null && v !== undefined && v !== "" ? `${k}: ${Array.isArray(v) ? v.join(", ") : v}` : null;
    const lines = [
      fmt("Naam", i.full_name),
      fmt("Leeftijd", i.age),
      fmt("Lengte (cm)", i.height_cm),
      fmt("Gewicht (kg)", i.weight_kg),
      fmt("Vetpercentage", i.body_fat_pct),
      fmt("Beroep", i.occupation),
      fmt("Activiteitsniveau", i.activity_level),
      fmt("Slaap (uren)", i.sleep_hours),
      fmt("Rookt", i.smokes),
      fmt("Alcohol", i.drinks_alcohol),
      fmt("Primair doel", i.primary_goal),
      fmt("Reden doel", i.goal_reason),
      fmt("Gewenst resultaat", i.target_outcome),
      fmt("Weken commitment", i.weeks_committed),
      fmt("Trainingsfrequentie nu", i.train_freq_current),
      fmt("Trainingsfrequentie target", i.train_freq_target),
      fmt("Trainingsdagen", i.train_days),
      fmt("Sinds wanneer trainen", i.lifting_since),
      fmt("Trainingslocatie", i.train_location),
      fmt("Focus spiergroepen", i.focus_muscles),
      fmt("Blessures", i.injuries),
      fmt("Volgt al een meal plan", i.follows_meal_plan),
      fmt("Dieet voorkeuren", i.diet_preferences),
      fmt("Maaltijden per dag", i.meals_per_day),
      fmt("Water (liter)", i.water_liters),
      fmt("Supplementen", i.supplements),
      fmt("Track macros", i.tracks_macros),
      fmt("Typische dag voeding", i.typical_day_food),
      fmt("Uitdagingen", i.challenges),
      fmt("Eerdere mislukkingen", i.past_failures),
      fmt("Verwachtingen van coach", i.coach_expectations),
      fmt("Wekelijkse trainingsuren", i.weekly_training_hours),
    ].filter(Boolean);
    parts.push(lines.join("\n"));

    if (i.details && typeof i.details === "object") {
      const det = i.details as Record<string, unknown>;
      const detailLines: string[] = [];
      if (det.medication_notes) detailLines.push(`Medicatie / bijzonderheden: ${det.medication_notes}`);
      if (det.referral_source) detailLines.push(`Hoe binnengekomen: ${det.referral_source}`);
      if (detailLines.length) parts.push(detailLines.join("\n"));
    }
  } else {
    parts.push("(geen intake data)");
  }

  parts.push("\n=== VOEDINGSSCHEMA ===");
  if (ctx.nutrition) {
    const n = ctx.nutrition;
    const d = (n.details ?? {}) as Record<string, unknown>;
    parts.push(
      [
        n.gender ? `Geslacht: ${n.gender}` : null,
        n.age ? `Leeftijd: ${n.age}` : null,
        n.height_cm ? `Lengte: ${n.height_cm} cm` : null,
        n.weight_kg ? `Gewicht: ${n.weight_kg} kg` : null,
        d.calories ? `Calorieën: ${d.calories} kcal` : null,
        d.protein_g ? `Eiwit: ${d.protein_g} g` : null,
        d.carbs_g ? `Koolhydraten: ${d.carbs_g} g` : null,
        d.fat_g ? `Vet: ${d.fat_g} g` : null,
        d.notes ? `Coach notities: ${d.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } else {
    parts.push("(geen voedingsschema)");
  }

  parts.push("\n=== TRAININGSSCHEMA ===");
  if (ctx.assignments.length === 0) {
    parts.push("(geen trainingsschema toegewezen)");
  } else {
    for (const a of ctx.assignments) {
      const plan = (a.plan ?? {}) as Record<string, unknown>;
      const days = (plan.workout_plan_days ?? []) as Array<Record<string, unknown>>;
      parts.push(
        `Plan: ${plan.name ?? "—"}${plan.description ? ` — ${plan.description}` : ""}`,
      );
      if (a.days) parts.push(`Trainingsdagen: ${(a.days as string[]).join(", ")}`);
      if (a.weeks) parts.push(`Duur: ${a.weeks} weken`);
      for (const day of days) {
        const exs = (day.workout_plan_exercises ?? []) as Array<Record<string, unknown>>;
        const exList = exs
          .sort((x, y) => Number(x.order_index) - Number(y.order_index))
          .map((e) => {
            const ex = (e.exercises ?? {}) as Record<string, unknown>;
            return `  - ${ex.name ?? "?"}${e.sets_reps ? ` (${e.sets_reps})` : ""}${e.notes ? ` — ${e.notes}` : ""}`;
          })
          .join("\n");
        parts.push(`Dag ${day.day_index ?? "?"} — ${day.name}:\n${exList}`);
      }
    }
  }

  // Deterministic facts — inject so the AI phrases them, doesn't invent them.
  const weightKg = Number(ctx.intake?.weight_kg) || Number((ctx.activeGoal as any)?.starting_weight_kg) || 0;
  const trainingHoursWeekly = Number(ctx.intake?.weekly_training_hours) || 0;
  const waterMl = weightKg > 0
    ? Math.round(35 * weightKg + (500 * trainingHoursWeekly) / 7)
    : null;

  const nd = (ctx.nutrition?.details ?? {}) as Record<string, unknown>;
  const targetProtein = Number(nd.protein_g) || 0;
  const dietaryProteinEstimate = weightKg * 1.2; // rough baseline from typical diet
  const proteinGap = Math.max(0, targetProtein - dietaryProteinEstimate);

  const currentSupps = String(ctx.intake?.supplements ?? "").toLowerCase();
  const suppsSuggested: string[] = [];
  if (!currentSupps.includes("creatine")) suppsSuggested.push("Creatine monohydraat 5 g per dag");
  if (proteinGap > 30 && !currentSupps.includes("whey"))
    suppsSuggested.push(`Whey proteïne (~${Math.round(proteinGap)} g eiwit-gap per dag)`);
  if (!currentSupps.includes("vitamine d") && !currentSupps.includes("vitamin d"))
    suppsSuggested.push("Vitamine D3 2000 IE/dag (vooral oktober–maart of bij weinig zon)");
  if (!currentSupps.includes("omega")) suppsSuggested.push("Omega-3 (EPA+DHA) 1–2 g/dag");
  if (!currentSupps.includes("magnesium")) suppsSuggested.push("Magnesium 200–400 mg (bisglycinaat) voor het slapen");

  parts.push("\n=== BEREKENDE FEITEN (gebruik deze exact — niet zelf berekenen) ===");
  if (waterMl != null) {
    parts.push(
      `Water: ${waterMl} ml per dag (formule: 35 ml × ${weightKg} kg lichaamsgewicht + 500 ml per trainingsuur, ~${trainingHoursWeekly} u/week).`,
    );
  }
  if (suppsSuggested.length) {
    parts.push("Supplement-advies (alleen wat de klant nog niet gebruikt):");
    suppsSuggested.forEach((s) => parts.push(`  - ${s}`));
  }

  parts.push(
    "\nGenereer nu de spraakmemo en klant bulletpoints op basis van bovenstaande data. Verwerk het water-getal en de supplement-suggesties concreet in het bericht — verzin geen andere doseringen. Gebruik de tool `coach_start_message` om je antwoord te structureren.",
  );

  return parts.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientId } = await req.json();
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

    // Verify caller is the coach
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

    // Fetch intake, nutrition, assignments+plans+days+exercises, active goal
    const [intakeRes, nutritionRes, assignRes, goalRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/onboarding_responses?user_id=eq.${clientId}&select=*`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/nutrition_plans?client_id=eq.${clientId}&select=*`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/client_workout_assignments?client_id=eq.${clientId}&is_active=eq.true&select=*,plan:workout_plans(name,description,frequency_per_week,workout_plan_days(day_index,name,workout_plan_exercises(order_index,sets_reps,notes,exercises(name,muscle_group,equipment))))`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/client_goals?client_id=eq.${clientId}&is_active=eq.true&order=created_at.desc&limit=1&select=*`,
        { headers },
      ),
    ]);

    const intakeArr = await intakeRes.json();
    const nutritionArr = await nutritionRes.json();
    const assignments = await assignRes.json();
    const goalArr = await goalRes.json();

    const ctx: ClientContext = {
      intake: Array.isArray(intakeArr) && intakeArr[0] ? intakeArr[0] : null,
      nutrition: Array.isArray(nutritionArr) && nutritionArr[0] ? nutritionArr[0] : null,
      assignments: Array.isArray(assignments) ? assignments : [],
      activeGoal: Array.isArray(goalArr) && goalArr[0] ? goalArr[0] : null,
    };


    const userPrompt = buildUserPrompt(ctx);

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
            name: "coach_start_message",
            description: "Het gestructureerde startbericht voor de klant.",
            input_schema: {
              type: "object",
              properties: {
                voice_memo: {
                  type: "string",
                  description:
                    "De volledige spraakmemo tekst die de coach zal voorlezen. Lange lopende tekst, in het Nederlands, geen emoji's of bulletpoints.",
                },
                client_positive: {
                  type: "array",
                  items: { type: "string" },
                  description: "Korte positieve punten voor de klant (1 zin per item).",
                },
                client_attention: {
                  type: "array",
                  items: { type: "string" },
                  description: "Aandachtspunten voor de klant (1 zin per item).",
                },
                client_actions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Concrete actiepunten voor deze week (max 5).",
                },
              },
              required: [
                "voice_memo",
                "client_positive",
                "client_attention",
                "client_actions",
              ],
            },
          },
        ],
        tool_choice: { type: "tool", name: "coach_start_message" },
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
      if (aiResp.status === 401) {
        return new Response(
          JSON.stringify({ error: "Ongeldige Anthropic API key." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      console.error("No tool use in response", JSON.stringify(aiData));
      return new Response(
        JSON.stringify({ error: "Onverwacht AI antwoord" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const args = toolUse.input ?? {};

    return new Response(
      JSON.stringify({
        voice_memo: args.voice_memo ?? "",
        client_positive: Array.isArray(args.client_positive) ? args.client_positive : [],
        client_attention: Array.isArray(args.client_attention) ? args.client_attention : [],
        client_actions: Array.isArray(args.client_actions) ? args.client_actions : [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-coach-message error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
