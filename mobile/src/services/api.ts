import { supabase } from '../lib/supabase';
import {
  AchievementStats, DailyActivityPoint, DropSet,
  Exercise, ExerciseDef, MuscleGroup, MuscleGroupBalance, MuscleGroupVolume, OneRmTrendPoint,
  Preset, PresetExercise, WeeklyVolumePoint, WeightUnit,
} from '../types';

const EXERCISE_SELECT = '*, exercise_sets(*)';

interface SetRow {
  id:         number;
  set_number: number;
  reps:       number | null;
  weight:     number | null;
  drops:      DropSet[];
}

interface ExerciseRow {
  id:         number;
  name:       string;
  date:       string;
  unit:       WeightUnit;
  notes:      string | null;
  created_at: string;
  updated_at: string;
  exercise_def_id: number | null;
  has_pr:     boolean;
  superset_partner_id: number | null;
  exercise_sets: SetRow[];
}

/** Supabase embeds the child table under its own name (`exercise_sets`):
 *  rename to `sets` and order by set_number so the shape matches `Exercise`. */
function mapRow(row: ExerciseRow): Exercise {
  return {
    id:         row.id,
    name:       row.name,
    date:       row.date,
    unit:       row.unit,
    notes:      row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    exercise_def_id: row.exercise_def_id,
    has_pr:     row.has_pr,
    superset_partner_id: row.superset_partner_id,
    sets: [...row.exercise_sets]
      .sort((a, b) => a.set_number - b.set_number)
      .map(s => ({
        id: s.id, set_number: s.set_number, reps: s.reps, weight: s.weight,
        drops: s.drops ?? [],
      })),
  };
}

export function checkError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Payload shape for a single set on create/update */
export interface SetInput {
  reps?:   number | null;
  weight?: number | null;
  /** Drops performed after this set, in order. Omit or leave empty for none. */
  drops?:  DropSet[];
}

export interface CreateExerciseDto {
  name:   string;
  date:   string;       // 'YYYY-MM-DD'
  unit:   WeightUnit;
  notes?: string | null;
  sets:   SetInput[];   // non-empty
  /** Catalog/custom def id. Always set by the picker flow. */
  exerciseDefId?: number | null;
}

/** Per-set PR flags, as returned by the create/update RPCs. */
export interface SetPrResult {
  set_number:   number;
  is_weight_pr: boolean;
  is_e1rm_pr:   boolean;
}

export interface SaveExerciseResult {
  exercise: Exercise;
  prSets:   SetPrResult[];
}

/** Live "is this set currently a record" flags, from the exercise_set_pr_flags view. */
export interface SetRecordFlags {
  set_id:       number;
  is_weight_pr: boolean;
  is_e1rm_pr:   boolean;
}

/** Fetch one exercise (with its sets) by id, in the same shape the RPCs need to return. */
async function fetchExerciseById(id: number): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises_with_pr')
    .select(EXERCISE_SELECT)
    .eq('id', id)
    .single();
  checkError(error);
  return mapRow(data as unknown as ExerciseRow);
}

export const workoutApi = {
  /** All exercises in [startDate, endDate] */
  getByRange: async (startDate: string, endDate: string): Promise<Exercise[]> => {
    const { data, error } = await supabase
      .from('exercises_with_pr')
      .select(EXERCISE_SELECT)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });
    checkError(error);
    return (data as unknown as ExerciseRow[]).map(mapRow);
  },

  /** All exercises on a single day */
  getByDate: async (date: string): Promise<Exercise[]> => {
    const { data, error } = await supabase
      .from('exercises_with_pr')
      .select(EXERCISE_SELECT)
      .eq('date', date)
      .order('created_at', { ascending: true });
    checkError(error);
    return (data as unknown as ExerciseRow[]).map(mapRow);
  },

  /** Live per-set record flags for one exercise (used by the edit screen). */
  getSetRecordFlags: async (exerciseId: number): Promise<SetRecordFlags[]> => {
    const { data, error } = await supabase
      .from('exercise_set_pr_flags')
      .select('set_id, is_weight_pr, is_e1rm_pr')
      .eq('exercise_id', exerciseId);
    checkError(error);
    return data as SetRecordFlags[];
  },

  /** Create a new exercise (with one or more sets), via the transactional RPC */
  create: async (dto: CreateExerciseDto): Promise<SaveExerciseResult> => {
    const { data, error } = await supabase.rpc('create_exercise_with_sets', {
      p_name:  dto.name,
      p_date:  dto.date,
      p_unit:  dto.unit,
      // '' (not null) tells the RPC "no notes". See update()'s comment below.
      p_notes: dto.notes ?? '',
      p_sets:  dto.sets,
      p_exercise_def_id: dto.exerciseDefId ?? null,
    });
    checkError(error);
    const { id, sets: prSets } = data as { id: number; sets: SetPrResult[] };
    const exercise = await fetchExerciseById(id);
    return { exercise, prSets };
  },

  /** Update an existing exercise. If `sets` is provided, all sets are replaced. */
  update: async (id: number, dto: Partial<CreateExerciseDto>): Promise<SaveExerciseResult> => {
    const { data, error } = await supabase.rpc('update_exercise_with_sets', {
      p_id:    id,
      p_name:  dto.name ?? null,
      p_unit:  dto.unit ?? null,
      // The RPC treats null as "notes not provided, leave unchanged" and ''
      // as "explicitly cleared". `dto.notes === undefined` means the caller
      // didn't touch notes at all; anything else (including null, which is
      // how AddExerciseScreen represents an emptied field) means clear it.
      p_notes: dto.notes === undefined ? null : (dto.notes ?? ''),
      p_sets:  dto.sets ?? null,
      // null = leave the existing link unchanged
      p_exercise_def_id: dto.exerciseDefId ?? null,
    });
    checkError(error);
    const { sets: prSets } = (data ?? { sets: [] }) as { sets: SetPrResult[] };
    const exercise = await fetchExerciseById(id);
    return { exercise, prSets };
  },

  /** Delete an exercise (cascades to its sets) */
  delete: async (id: number): Promise<void> => {
    const { data, error } = await supabase.from('exercises').delete().eq('id', id).select('id');
    checkError(error);
    if (!data || data.length === 0) {
      throw new Error('Exercise not found. It may have already been deleted.');
    }
  },

  /** Link two same-day exercises as a superset, or unlink with partnerId = null. */
  setSupersetPartner: async (exerciseId: number, partnerId: number | null): Promise<void> => {
    const { error } = await supabase.rpc('set_superset_partner', {
      p_exercise_id: exerciseId,
      p_partner_id:  partnerId,
    });
    checkError(error);
  },
};

// ── Exercise catalog ─────────────────────────────────────────────

interface ExerciseDefRow {
  id:               number;
  user_id:          string | null;
  name:             string;
  muscle_group:     MuscleGroup;
  equipment:        string;
  movement_pattern: string | null;
  image_key:        string | null;
}

/** One "did you mean?" candidate from create_custom_exercise. */
export interface CustomSuggestion {
  id:           number;
  name:         string;
  muscle_group: MuscleGroup;
  is_custom:    boolean;
  similarity:   number;
}

export type CreateCustomResult =
  | { created: true;  def: { id: number; name: string; muscle_group: MuscleGroup; equipment: string } }
  | { created: false; suggestions: CustomSuggestion[] };

/** Best current lifts for one exercise def, or nulls if never logged. */
export interface ExercisePr {
  /** `date` is the day the record was set ('YYYY-MM-DD'). Optional so an
   *  older server (before migration 026) still parses, just without the link. */
  best_weight: { weight: number; unit: WeightUnit; reps: number | null; date?: string } | null;
  best_e1rm:   { weight: number; unit: WeightUnit; reps: number; e1rm_kg: number; date?: string } | null;
}

/** Heaviest weighted set from the most recent session logged against an
 *  exercise def: the reference weight warm-up suggestions ramp into. */
export interface LastWorkingSet {
  weight: number;
  unit:   WeightUnit;
  reps:   number | null;
  date:   string; // 'YYYY-MM-DD'
}

export const catalogApi = {
  /** Global catalog + the caller's customs (RLS scopes the rest out).
   *  Catalog rows (user_id null) sort before customs, name A-Z within
   *  each, so a user's customs always cluster at the bottom of every
   *  muscle-group list and search result instead of interleaving. */
  list: async (): Promise<ExerciseDef[]> => {
    const { data, error } = await supabase
      .from('exercise_defs')
      .select('id, user_id, name, muscle_group, equipment, movement_pattern, image_key')
      .order('user_id', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true });
    checkError(error);
    return (data as ExerciseDefRow[]).map(d => ({
      id:               d.id,
      name:             d.name,
      muscle_group:     d.muscle_group,
      equipment:        d.equipment,
      movement_pattern: d.movement_pattern,
      image_key:        d.image_key,
      is_custom:        d.user_id !== null,
    }));
  },

  /** Create a custom exercise; may return near-match suggestions instead. */
  createCustom: async (
    name: string, muscleGroup: MuscleGroup, equipment: string, force = false,
  ): Promise<CreateCustomResult> => {
    const { data, error } = await supabase.rpc('create_custom_exercise', {
      p_name:         name,
      p_muscle_group: muscleGroup,
      p_equipment:    equipment,
      p_force:        force,
    });
    checkError(error);
    return data as CreateCustomResult;
  },

  /** Delete one of the caller's custom exercises (RLS blocks catalog rows
   *  and other users' customs). Past logs keep their name snapshot but lose
   *  the def link; the exercise is dropped from any presets it was in. */
  deleteCustom: async (exerciseDefId: number): Promise<void> => {
    const { error } = await supabase
      .from('exercise_defs')
      .delete()
      .eq('id', exerciseDefId);
    checkError(error);
  },

  /** Current best weight set and best e1RM set for a def (kg-compared server-side). */
  getPr: async (exerciseDefId: number): Promise<ExercisePr> => {
    const { data, error } = await supabase.rpc('get_exercise_pr', {
      p_exercise_def_id: exerciseDefId,
    });
    checkError(error);
    return data as ExercisePr;
  },

  /** Heaviest set from the most recent session for a def, or null if never
   *  logged: the reference weight warm-up suggestions ramp into. */
  getLastWorkingSet: async (exerciseDefId: number): Promise<LastWorkingSet | null> => {
    const { data, error } = await supabase.rpc('get_last_working_set', {
      p_exercise_def_id: exerciseDefId,
    });
    checkError(error);
    return data as LastWorkingSet | null;
  },
};

// ── Presets ──────────────────────────────────────────────────────

interface PresetRow {
  id:         number;
  name:       string;
  created_at: string;
  updated_at: string;
  exercises:  PresetExercise[];
}

export const presetApi = {
  /** All of the caller's presets, each with its ordered exercise list. */
  list: async (): Promise<Preset[]> => {
    const { data, error } = await supabase
      .from('presets_with_exercises')
      .select('id, name, created_at, updated_at, exercises')
      .order('name', { ascending: true });
    checkError(error);
    return data as PresetRow[];
  },

  /** Create a new preset. `exerciseDefIds` order is preserved. */
  create: async (name: string, exerciseDefIds: number[]): Promise<number> => {
    const { data, error } = await supabase.rpc('create_preset', {
      p_name: name,
      p_exercise_def_ids: exerciseDefIds,
    });
    checkError(error);
    return data as number;
  },

  /** Rename a preset and replace its entire exercise list. */
  update: async (id: number, name: string, exerciseDefIds: number[]): Promise<void> => {
    const { error } = await supabase.rpc('update_preset', {
      p_id: id,
      p_name: name,
      p_exercise_def_ids: exerciseDefIds,
    });
    checkError(error);
  },

  /** Delete a preset (its preset_exercises rows cascade). */
  delete: async (id: number): Promise<void> => {
    const { data, error } = await supabase.from('presets').delete().eq('id', id).select('id');
    checkError(error);
    if (!data || data.length === 0) {
      throw new Error('Preset not found. It may have already been deleted.');
    }
  },

  /** Apply a preset to a day: creates one exercise (with one empty set) per
   *  preset item, in saved order. Always appends; caller should refetch the
   *  day's exercises afterward. */
  applyToDay: async (presetId: number, date: string): Promise<void> => {
    const { error } = await supabase.rpc('apply_preset_to_day', {
      p_preset_id: presetId,
      p_date: date,
    });
    checkError(error);
  },
};

// ── AI workout generator ─────────────────────────────────────────

/** One exercise the generate-workout Edge Function proposed. Already
 *  server-validated against the caller's own catalog: exercise_def_id is
 *  guaranteed to exist and be accessible, but the row still needs a name/
 *  muscle group resolved from the catalog before it can be shown. */
export interface AiExerciseSuggestion {
  exercise_def_id: number;
  sets:             number;
  target_reps:      number;
  notes?:           string;
}

/** Best-effort extraction of the Edge Function's `{ error: string }` body
 *  from a supabase-js FunctionsHttpError, whose `.context` is the raw
 *  Response. Falls back to null if the body isn't there or isn't JSON. */
async function extractFunctionErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response }).context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    const body = await context.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

export const aiApi = {
  /** Ask the AI workout generator for a set of catalog exercises for `date`,
   *  based on a free-text prompt. Never writes anything itself: the caller
   *  reviews the suggestions and saves each one via workoutApi.create(),
   *  same as adding exercises by hand. */
  generateWorkout: async (date: string, prompt: string): Promise<AiExerciseSuggestion[]> => {
    const { data, error } = await supabase.functions.invoke('generate-workout', {
      body: { date, prompt },
    });
    if (error) {
      const message = await extractFunctionErrorMessage(error);
      throw new Error(message ?? 'Could not generate a workout. Please try again.');
    }
    return (data?.exercises ?? []) as AiExerciseSuggestion[];
  },
};

// ── Progress / analytics ────────────────────────────────────────
// All three RPCs are kg-normalized and keyed off exercise_def_id
// server-side (see migration 011). Nothing here does unit math or
// exercise-identity matching client-side.

export const analyticsApi = {
  /** Best estimated 1RM (Epley) per day for one exercise, since `sinceDate` (or all time if null). */
  get1RmTrend: async (exerciseDefId: number, sinceDate: string | null): Promise<OneRmTrendPoint[]> => {
    const { data, error } = await supabase.rpc('exercise_1rm_trend', {
      p_exercise_def_id: exerciseDefId,
      p_since: sinceDate,
    });
    checkError(error);
    return data as OneRmTrendPoint[];
  },

  /** Weekly total volume for one exercise. Exactly one of exerciseDefId/muscleGroup must be set. */
  getWeeklyVolumeTrend: async (
    filter: { exerciseDefId: number; muscleGroup?: never } | { exerciseDefId?: never; muscleGroup: MuscleGroup },
    sinceDate: string | null,
  ): Promise<WeeklyVolumePoint[]> => {
    const { data, error } = await supabase.rpc('weekly_volume_trend', {
      p_exercise_def_id: filter.exerciseDefId ?? null,
      p_muscle_group:    filter.muscleGroup ?? null,
      p_since:           sinceDate,
    });
    checkError(error);
    return data as WeeklyVolumePoint[];
  },

  /** Total volume per muscle group since `sinceDate` (or all time if null). */
  getMuscleGroupBreakdown: async (sinceDate: string | null): Promise<MuscleGroupVolume[]> => {
    const { data, error } = await supabase.rpc('muscle_group_volume_breakdown', {
      p_since: sinceDate,
    });
    checkError(error);
    return data as MuscleGroupVolume[];
  },

  /** Each muscle group's last 7 days of hard sets vs. its own trailing
   *  8-week weekly average: the over/under-trained heatmap. */
  getMuscleGroupBalance: async (): Promise<MuscleGroupBalance[]> => {
    const { data, error } = await supabase.rpc('muscle_group_training_balance', {});
    checkError(error);
    return data as MuscleGroupBalance[];
  },

  /** Per-day activity for the last `days` days (server-clamped to 1-90),
   *  zero-filled: rest days come back as real zeroes, not gaps. */
  getDailyActivity: async (days: number): Promise<DailyActivityPoint[]> => {
    const { data, error } = await supabase.rpc('get_daily_activity', { p_days: days });
    checkError(error);
    return data as DailyActivityPoint[];
  },

  /** Lifetime totals the dashboard's badges are derived from. */
  getAchievementStats: async (): Promise<AchievementStats> => {
    const { data, error } = await supabase.rpc('get_achievement_stats', {});
    checkError(error);
    return data as AchievementStats;
  },
};
