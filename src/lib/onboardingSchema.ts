// Single source of truth for the LIFT360 intake form.
// Used by both the wizard (Onboarding.tsx) and the read-only display (ClientProfile.tsx).

export type Lang = "nl" | "en";

export type Bilingual = { nl: string; en: string };
export const t = (b: Bilingual, lang: Lang) => b[lang];

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "radio"
  | "checkbox-group"
  | "boolean"
  | "image"
  | "image-front-side-back";

export interface Field {
  name: string; // matches DB column or details.* key
  label: Bilingual;
  type: FieldType;
  options?: { value: string; label: Bilingual }[];
  placeholder?: Bilingual;
  optional?: boolean;
  storeIn?: "column" | "details"; // default 'column'
  unit?: string;
}

export interface Section {
  id: string;
  title: Bilingual;
  description?: Bilingual;
  fields: Field[];
}

export const onboardingSections: Section[] = [
  {
    id: "personal",
    title: { nl: "Persoonlijke gegevens", en: "Personal info" },
    fields: [
      { name: "full_name", label: { nl: "Naam", en: "Full name" }, type: "text" },
      { name: "age", label: { nl: "Leeftijd", en: "Age" }, type: "number" },
      { name: "height_cm", label: { nl: "Lengte (cm)", en: "Height (cm)" }, type: "number" },
      { name: "weight_kg", label: { nl: "Huidig gewicht (kg)", en: "Current weight (kg)" }, type: "number" },
      { name: "body_fat_pct", label: { nl: "Vetpercentage (indien bekend)", en: "Body fat % (if known)" }, type: "number", optional: true },
      { name: "belly_cm", label: { nl: "Omvang buik (cm)", en: "Belly circumference (cm)" }, type: "number", optional: true },
      { name: "waist_cm", label: { nl: "Omvang taille (cm)", en: "Waist (cm)" }, type: "number", optional: true },
      { name: "hips_cm", label: { nl: "Omvang heupen (cm)", en: "Hips (cm)" }, type: "number", optional: true },
      { name: "occupation", label: { nl: "Beroep", en: "Occupation" }, type: "text" },
      {
        name: "activity_level",
        label: { nl: "Dagelijkse activiteit", en: "Daily activity" },
        type: "radio",
        options: [
          { value: "active", label: { nl: "Actief", en: "Active" } },
          { value: "sedentary", label: { nl: "Zittend", en: "Sedentary" } },
        ],
      },
      { name: "sleep_hours", label: { nl: "Uur slaap per nacht (gemiddeld)", en: "Sleep hours / night (avg)" }, type: "number" },
      { name: "smokes", label: { nl: "Rook je?", en: "Do you smoke?" }, type: "text" },
      { name: "drinks_alcohol", label: { nl: "Drink je alcohol?", en: "Do you drink alcohol?" }, type: "text" },
    ],
  },
  {
    id: "goals",
    title: { nl: "Doelen", en: "Goals" },
    fields: [
      {
        name: "primary_goal",
        label: { nl: "Wat is jouw belangrijkste doel?", en: "What is your main goal?" },
        type: "radio",
        options: [
          { value: "muscle", label: { nl: "Spiermassa opbouwen", en: "Build muscle" } },
          { value: "cut", label: { nl: "Droogtrainen / vet verliezen", en: "Cut / lose fat" } },
          { value: "energy", label: { nl: "Meer energie en structuur", en: "More energy & structure" } },
          { value: "combo", label: { nl: "Combinatie", en: "Combination" } },
        ],
      },
      { name: "goal_reason", label: { nl: "Waarom is dit doel belangrijk voor je?", en: "Why is this goal important to you?" }, type: "textarea" },
      { name: "target_outcome", label: { nl: "Concreet streefgewicht of uiterlijk?", en: "Concrete target weight or look?" }, type: "textarea", optional: true },
      { name: "weeks_committed", label: { nl: "Weken bereid te investeren (min. 16)", en: "Weeks willing to commit (min. 16)" }, type: "number" },
    ],
  },
  {
    id: "training",
    title: { nl: "Trainingservaring", en: "Training experience" },
    fields: [
      { name: "train_freq_current", label: { nl: "Hoe vaak train je nu per week?", en: "Times you train per week (current)" }, type: "number" },
      { name: "train_freq_target", label: { nl: "Hoe vaak ben je bereid te trainen?", en: "Times per week willing to train" }, type: "number" },
      {
        name: "train_days",
        label: { nl: "Welke dagen wil je trainen?", en: "Which days do you want to train?" },
        type: "checkbox-group",
        options: [
          { value: "mon", label: { nl: "Maandag", en: "Monday" } },
          { value: "tue", label: { nl: "Dinsdag", en: "Tuesday" } },
          { value: "wed", label: { nl: "Woensdag", en: "Wednesday" } },
          { value: "thu", label: { nl: "Donderdag", en: "Thursday" } },
          { value: "fri", label: { nl: "Vrijdag", en: "Friday" } },
          { value: "sat", label: { nl: "Zaterdag", en: "Saturday" } },
          { value: "sun", label: { nl: "Zondag", en: "Sunday" } },
        ],
      },
      { name: "lifting_since", label: { nl: "Sinds wanneer doe je aan krachttraining?", en: "Since when do you lift?" }, type: "text" },
      {
        name: "train_location",
        label: { nl: "Waar train je?", en: "Where do you train?" },
        type: "radio",
        options: [
          { value: "gym", label: { nl: "Sportschool", en: "Gym" } },
          { value: "home", label: { nl: "Thuis", en: "Home" } },
          { value: "other", label: { nl: "Anders", en: "Other" } },
        ],
      },
      { name: "train_location_other", label: { nl: "Toelichting (indien anders)", en: "Specify (if other)" }, type: "text", optional: true },
      {
        name: "equipment_brands",
        label: { nl: "Welk merk materiaal heb je tot je beschikking?", en: "Which equipment brands are available?" },
        type: "checkbox-group",
        options: [
          { value: "matrix", label: { nl: "Matrix", en: "Matrix" } },
          { value: "hammerstrength", label: { nl: "Hammer Strength", en: "Hammer Strength" } },
          { value: "technogym", label: { nl: "Technogym", en: "Technogym" } },
          { value: "other", label: { nl: "Anders", en: "Other" } },
        ],
      },
      {
        name: "focus_muscles",
        label: { nl: "Welke spiergroep wil je focus geven?", en: "Which muscle groups to focus on?" },
        type: "checkbox-group",
        options: [
          { value: "chest", label: { nl: "Borst", en: "Chest" } },
          { value: "back", label: { nl: "Rug", en: "Back" } },
          { value: "shoulders", label: { nl: "Schouders", en: "Shoulders" } },
          { value: "arms", label: { nl: "Armen", en: "Arms" } },
          { value: "legs", label: { nl: "Benen", en: "Legs" } },
          { value: "glutes", label: { nl: "Bilspieren", en: "Glutes" } },
          { value: "core", label: { nl: "Core", en: "Core" } },
        ],
      },
      { name: "injuries", label: { nl: "Blessures of beperkingen?", en: "Injuries or limitations?" }, type: "textarea", optional: true },
      { name: "medication_notes", label: { nl: "Neem je iets van medicatie of zijn er andere bijzonderheden die benoemingswaardig zijn?", en: "Do you take any medication or are there other notable details to mention?" }, type: "textarea", optional: true, storeIn: "details" },
    ],
  },
  {
    id: "nutrition",
    title: { nl: "Voeding & leefstijl", en: "Nutrition & lifestyle" },
    fields: [
      { name: "follows_meal_plan", label: { nl: "Eet je momenteel volgens een schema?", en: "Do you follow a meal plan?" }, type: "boolean" },
      { name: "diet_preferences", label: { nl: "Dieetvoorkeuren of -beperkingen?", en: "Dietary preferences or restrictions?" }, type: "text", optional: true },
      { name: "meals_per_day", label: { nl: "Maaltijden per dag", en: "Meals per day" }, type: "number" },
      { name: "water_liters", label: { nl: "Water per dag (liter)", en: "Water per day (liters)" }, type: "number" },
      { name: "supplements", label: { nl: "Supplementen (zo ja, welke?)", en: "Supplements (if any, which?)" }, type: "text", optional: true },
      { name: "tracks_macros", label: { nl: "Bekend met calorieën / macro's tracken?", en: "Familiar with tracking calories / macros?" }, type: "boolean" },
      { name: "typical_day_food", label: { nl: "Hoe ziet een typische dag eten eruit?", en: "What does a typical day of eating look like?" }, type: "textarea" },
    ],
  },
  {
    id: "mindset",
    title: { nl: "Mindset & gewoontes", en: "Mindset & habits" },
    fields: [
      {
        name: "challenges",
        label: { nl: "Waar loop je het meest tegenaan?", en: "What do you struggle with most?" },
        type: "checkbox-group",
        options: [
          { value: "consistency", label: { nl: "Consistentie", en: "Consistency" } },
          { value: "discipline", label: { nl: "Discipline", en: "Discipline" } },
          { value: "planning", label: { nl: "Planning / structuur", en: "Planning / structure" } },
          { value: "insecurity", label: { nl: "Onzekerheid", en: "Insecurity" } },
          { value: "self_image", label: { nl: "Zelfbeeld", en: "Self-image" } },
        ],
      },
      { name: "past_failures", label: { nl: "Wat heb je in het verleden geprobeerd dat niet werkte?", en: "What have you tried before that didn't work?" }, type: "textarea", optional: true },
      { name: "coach_expectations", label: { nl: "Wat verwacht je van mij als coach?", en: "What do you expect from me as a coach?" }, type: "textarea" },
      { name: "weekly_training_hours", label: { nl: "Hoeveel uur per week kun je aan training besteden?", en: "Hours per week available for training" }, type: "number" },
    ],
  },
  {
    id: "optional",
    title: { nl: "Optioneel", en: "Optional" },
    description: {
      nl: "Voeg recente progressiefoto's toe en (indien je die gebruikt) een screenshot van je stappenteller.",
      en: "Add recent progress photos and (if you use one) a screenshot of your step counter.",
    },
    fields: [
      { name: "progress_photos", label: { nl: "Progressiefoto's (front / zij / achter)", en: "Progress photos (front / side / back)" }, type: "image-front-side-back", optional: true },
      {
        name: "photo_consent",
        label: { nl: "Mogen je foto's gebruikt worden voor inspiratie (socials/website)?", en: "May we use your photos for inspiration (socials/website)?" },
        type: "radio",
        optional: true,
        options: [
          { value: "yes", label: { nl: "Ja, geen probleem", en: "Yes, no problem" } },
          { value: "no_face", label: { nl: "Ja, maar zonder gezicht", en: "Yes, but without my face" } },
          { value: "no", label: { nl: "Nee, liever niet", en: "No, rather not" } },
        ],
      },
      { name: "step_tracker_screenshot_path", label: { nl: "Screenshot stappenteller / Apple Watch / Fitbit", en: "Step counter / Apple Watch / Fitbit screenshot" }, type: "image", optional: true },
      {
        name: "referral_source",
        label: { nl: "Hoe ben je bij mij terecht gekomen?", en: "How did you find me?" },
        type: "radio",
        storeIn: "details",
        options: [
          { value: "instagram", label: { nl: "Instagram", en: "Instagram" } },
          { value: "instagram_dm", label: { nl: "Instagram DM", en: "Instagram DM" } },
          { value: "facebook", label: { nl: "Facebook", en: "Facebook" } },
          { value: "website", label: { nl: "Website", en: "Website" } },
          { value: "friends_family", label: { nl: "Vrienden, familie, kennissen", en: "Friends, family, acquaintances" } },
          { value: "gym", label: { nl: "De sportschool", en: "The gym" } },
          { value: "other", label: { nl: "Anders", en: "Other" } },
        ],
      },
      { name: "referral_source_other", label: { nl: "Toelichting (indien anders)", en: "Specify (if other)" }, type: "text", optional: true, storeIn: "details" },
    ],
  },
];

// Columns that are stored as text[] in the DB
export const arrayColumns = new Set(["train_days", "equipment_brands", "focus_muscles", "challenges"]);
// Columns that are boolean in the DB
export const booleanColumns = new Set(["follows_meal_plan", "tracks_macros"]);
// Columns that are numeric in the DB
export const numericColumns = new Set([
  "age",
  "height_cm",
  "weight_kg",
  "body_fat_pct",
  "waist_cm",
  "hips_cm",
  "belly_cm",
  "sleep_hours",
  "weeks_committed",
  "train_freq_current",
  "train_freq_target",
  "meals_per_day",
  "water_liters",
  "weekly_training_hours",
]);
