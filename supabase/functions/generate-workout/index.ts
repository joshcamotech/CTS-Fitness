// Supabase Edge Function: generate-workout
//
// Takes a free-text prompt + a date, asks Gemini (free tier) to propose a
// workout built only from the caller's own exercise catalog, validates the
// result server-side, and returns it. Never writes to the database itself —
// the client reviews the suggestion and saves it via the existing
// create_exercise_with_sets RPC, same as adding exercises by hand.
//
// Required secrets (supabase secrets set ...):
//   GEMINI_API_KEY   — from https://aistudio.google.com/apikey, free tier
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically by the
// Edge Functions runtime — no need to set them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
// Google retires and renames flash-tier models quickly (2.5-flash and then
// others have 404'd for new keys), and a single stale ID takes the whole
// feature down with "unavailable". So try a short list in order and use the
// first one the API accepts. Set the GEMINI_MODEL secret to pin a specific
// model first. `gemini-flash-latest` is Google's own alias for the current
// flash model and is the last-resort fallback.
// Current IDs: https://ai.google.dev/gemini-api/docs/models
const GEMINI_MODELS = [
  Deno.env.get('GEMINI_MODEL'),
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
].filter((m): m is string => !!m);

// Bounds are deliberately generous but finite — they exist to stop a
// misbehaving/adversarial model response from producing something absurd,
// not to constrain normal programming choices.
const DAILY_GENERATION_CAP = 15;
const MAX_EXERCISES = 8;
const MAX_SETS = 8;
const MAX_REPS = 50;
const HISTORY_DAYS = 30;
const HISTORY_LIMIT = 40;
const MAX_PROMPT_LENGTH = 500;

interface CatalogRow {
  id: number;
  name: string;
  muscle_group: string;
  equipment: string;
  movement_pattern: string | null;
}

interface HistoryRow {
  name: string;
  date: string;
  has_pr: boolean;
}

interface AiExercise {
  exercise_def_id: number;
  sets: number;
  target_reps: number;
  notes?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(max, Math.max(min, v));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: { date?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  const date = body.date;
  const prompt = (body.prompt ?? '').trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ error: 'A valid date is required' }, 400);
  }
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    return jsonResponse(
      { error: `Describe the workout you want in ${MAX_PROMPT_LENGTH} characters or less` },
      400,
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  // Client scoped to the caller's own JWT — every query below runs under
  // their RLS policies, same access the mobile app already has.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }
  const userId = userData.user.id;

  // ── Rate limit ──────────────────────────────────────────────────
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countError } = await supabase
    .from('ai_generation_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if (countError) {
    return jsonResponse({ error: 'Could not check your generation limit' }, 500);
  }
  if ((recentCount ?? 0) >= DAILY_GENERATION_CAP) {
    return jsonResponse(
      { error: `You've hit today's limit of ${DAILY_GENERATION_CAP} AI workout generations. Try again tomorrow.` },
      429,
    );
  }

  // Log the attempt now — before calling the provider — so a burst of
  // failed/retried calls still counts against the cap (the cap exists to
  // protect the shared free-tier quota, not just to bound success count).
  await supabase.from('ai_generation_log').insert({ user_id: userId });

  // ── Grounding context ─────────────────────────────────────────────
  const { data: catalogData, error: catalogError } = await supabase
    .from('exercise_defs')
    .select('id, name, muscle_group, equipment, movement_pattern');
  if (catalogError || !catalogData || catalogData.length === 0) {
    return jsonResponse({ error: 'Could not load your exercise catalog' }, 500);
  }
  const catalog = catalogData as CatalogRow[];
  const catalogIds = new Set(catalog.map((c) => c.id));

  const historySince = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const { data: historyData } = await supabase
    .from('exercises_with_pr')
    .select('name, date, has_pr')
    .gte('date', historySince)
    .order('date', { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = (historyData ?? []) as HistoryRow[];

  // ── Build the prompt ────────────────────────────────────────────
  const catalogText = catalog
    .map((c) => `${c.id}: ${c.name} (${c.muscle_group}, ${c.equipment})`)
    .join('\n');
  const historyText = history.length > 0
    ? history.map((h) => `${h.date}: ${h.name}${h.has_pr ? ' (PR)' : ''}`).join('\n')
    : '(no recent training history)';

  const systemInstruction = [
    "You are a strength-training coach building one day's workout for a lifter.",
    'You may ONLY use exercises from the numbered catalog below, referenced by their exact id.',
    'Never invent an exercise or id that is not in the catalog.',
    `Propose between 1 and ${MAX_EXERCISES} exercises appropriate to the user's request.`,
    `For each exercise, propose a sensible number of sets (1-${MAX_SETS}) and a target rep count ` +
      `(1-${MAX_REPS}) suited to that exercise's style (lower reps for heavy compounds, higher for ` +
      'isolation/accessory work).',
    "Use the recent training history to inform balance and progression — don't just repeat what " +
      'was trained most recently unless the user asks for that.',
    '',
    'Catalog (id: name (muscle group, equipment)):',
    catalogText,
    '',
    `Recent training history (last ${HISTORY_DAYS} days):`,
    historyText,
  ].join('\n');

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      exercises: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            exercise_def_id: { type: 'INTEGER' },
            sets: { type: 'INTEGER' },
            target_reps: { type: 'INTEGER' },
            notes: { type: 'STRING' },
          },
          required: ['exercise_def_id', 'sets', 'target_reps'],
        },
      },
    },
    required: ['exercises'],
  };

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set: run `supabase secrets set GEMINI_API_KEY=...`');
    return jsonResponse(
      { error: 'The AI workout generator is not set up yet (missing API key).' },
      503,
    );
  }

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: `${systemInstruction}\n\nUser request: ${prompt}` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  let parsed: { exercises?: unknown };
  try {
    let geminiRes: Response | null = null;
    let lastStatus = 0;
    let lastReason = '';
    for (const model of GEMINI_MODELS) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          // Key in a header rather than the URL so it never lands in logs.
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
          body: requestBody,
        },
      );
      if (res.ok) {
        geminiRes = res;
        break;
      }
      // Always log the provider's reason: it is the only way to tell a bad
      // key from a retired model from a quota problem.
      const errText = await res.text();
      console.error(`Gemini ${model} failed`, res.status, errText);
      lastStatus = res.status;
      try {
        lastReason = JSON.parse(errText)?.error?.status ?? '';
      } catch { /* not JSON */ }
      // 404 = model retired/unknown; 429/5xx = that model is rate-limited or
      // overloaded (quotas are per model), so try the next one. Anything else
      // (bad key, bad request) would fail identically on every model.
      if (![404, 429, 500, 502, 503, 504].includes(res.status)) break;
    }

    if (!geminiRes) {
      // The code (e.g. 403 PERMISSION_DENIED, 429 RESOURCE_EXHAUSTED) is safe
      // to show and makes a failure diagnosable straight from the phone.
      const detail = `Google error ${lastStatus}${lastReason ? ` ${lastReason}` : ''}`;
      return jsonResponse(
        { error: `The AI workout generator is unavailable right now (${detail}). Try again in a moment.` },
        502,
      );
    }

    const geminiBody = await geminiRes.json();
    const text = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      return jsonResponse(
        { error: 'The AI did not return a usable response. Try rephrasing your request.' },
        502,
      );
    }
    parsed = JSON.parse(text);
  } catch (e) {
    console.error('Gemini call failed', e);
    return jsonResponse(
      { error: 'The AI workout generator is unavailable right now. Try again in a moment.' },
      502,
    );
  }

  // ── Validate & clamp — never trust the model's output directly ──────
  const rawExercises = Array.isArray(parsed?.exercises) ? parsed.exercises : [];
  const seen = new Set<number>();
  const exercises: AiExercise[] = [];
  for (const item of rawExercises as Record<string, unknown>[]) {
    const defId = item?.exercise_def_id;
    if (typeof defId !== 'number' || !catalogIds.has(defId) || seen.has(defId)) continue;
    seen.add(defId);
    exercises.push({
      exercise_def_id: defId,
      sets: clamp(item?.sets, 1, MAX_SETS, 3),
      target_reps: clamp(item?.target_reps, 1, MAX_REPS, 10),
      notes: typeof item?.notes === 'string' ? item.notes.slice(0, 200) : undefined,
    });
    if (exercises.length >= MAX_EXERCISES) break;
  }

  if (exercises.length === 0) {
    return jsonResponse(
      { error: 'Could not generate a valid workout from that request. Try rephrasing it.' },
      422,
    );
  }

  return jsonResponse({ exercises });
});
