import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert,
  KeyboardAvoidingView, Keyboard, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

import { ColorTokens } from '../theme/colorways';
import { useTheme } from '../theme/ThemeContext';
import { FONT, RADIUS } from '../constants/theme';
import { useFormStyles } from '../constants/formStyles';
import { muscleGroupLabel } from '../constants/muscleGroups';
import { RootStackParamList, WeightUnit, MuscleGroup } from '../types';
import { aiApi, catalogApi, workoutApi } from '../services/api';
import { GradientButton } from '../components/GradientButton';
import { KeyboardFieldBar } from '../components/KeyboardFieldBar';
import { useFieldChain } from '../hooks/useFieldChain';
import { haptics } from '../utils/haptics';
import { parseDateStr } from '../utils/dateUtils';

type Nav   = NativeStackNavigationProp<RootStackParamList, 'AiWorkout'>;
type Route = RouteProp<RootStackParamList, 'AiWorkout'>;
interface Props { navigation: Nav; route: Route }

const QUICK_PROMPTS = [
  'Push day, chest focus',
  'Pull day, back and biceps',
  'Leg day',
  'Based on what I trained last week',
];

/** One AI-suggested exercise, resolved against the catalog and editable
 *  before saving. Sets/weight/reps apply uniformly to every set: this
 *  screen proposes a rep/set scheme, not a full per-set editor (that's
 *  what editing the saved exercise afterward, via AddExerciseScreen, is for). */
interface SuggestionRow {
  exerciseDefId: number;
  name:          string;
  muscleGroup:   MuscleGroup;
  sets:          string;
  reps:          string;
  weight:        string;
  unit:          WeightUnit;
  notes?:        string;
  /** True if `weight` was pre-filled from a previously logged set for this
   *  exercise (via catalogApi.getLastWorkingSet). False means you've never
   *  logged it before, so the field starts blank and needs your own number, because
   *  the AI never guesses a weight. */
  hasHistory:    boolean;
}

type SuggestionField = 'sets' | 'weight' | 'reps';

export function AiWorkoutScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useFormStyles();
  const { date, dayFull, initialPrompt } = route.params;

  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'AI Workout Generator' });
  }, [navigation]);

  // ── Generate ──────────────────────────────────────────────────
  const generate = async () => {
    if (!prompt.trim()) {
      Alert.alert('Missing info', 'Describe the workout you want first.');
      return;
    }
    Keyboard.dismiss();
    haptics.tap();
    setGenerating(true);
    setSuggestions(null);
    try {
      const [proposed, catalog] = await Promise.all([
        aiApi.generateWorkout(date, prompt.trim()),
        catalogApi.list(),
      ]);
      const catalogById = new Map(catalog.map(c => [c.id, c]));

      const rows = await Promise.all(
        proposed.map(async (p): Promise<SuggestionRow | null> => {
          const def = catalogById.get(p.exercise_def_id);
          if (!def) return null; // shouldn't happen: server already validated this
          const lastWorking = await catalogApi.getLastWorkingSet(p.exercise_def_id).catch(() => null);
          return {
            exerciseDefId: def.id,
            name:          def.name,
            muscleGroup:   def.muscle_group,
            sets:          String(p.sets),
            reps:          String(p.target_reps),
            weight:        lastWorking ? String(lastWorking.weight) : '',
            unit:          lastWorking?.unit ?? 'KG',
            notes:         p.notes,
            hasHistory:    lastWorking !== null,
          };
        })
      );

      const valid = rows.filter((r): r is SuggestionRow => r !== null);
      if (valid.length === 0) {
        Alert.alert('No suggestions', 'Could not build a workout from that request. Try rephrasing it.');
        return;
      }
      haptics.success();
      setSuggestions(valid);
    } catch (e) {
      haptics.warning();
      Alert.alert('Error', (e as Error).message ?? 'Could not generate a workout.');
    } finally {
      setGenerating(false);
    }
  };

  // ── Keyboard Back/Next chaining ──────────────────────────────
  // Same as AddExerciseScreen: sets -> weight -> reps, then the next row.
  const fieldKeys = (suggestions ?? []).flatMap((_, i) => [`sets-${i}`, `weight-${i}`, `reps-${i}`]);
  const chain = useFieldChain(fieldKeys);

  // ── Edit / remove suggestion rows ────────────────────────────────
  const updateRow = (index: number, field: SuggestionField, value: string) => {
    setSuggestions(prev => prev
      ? prev.map((r, i) => i === index ? { ...r, [field]: value } : r)
      : prev);
  };

  const removeRow = (index: number) => {
    haptics.tap();
    setSuggestions(prev => prev ? prev.filter((_, i) => i !== index) : prev);
  };

  // ── Save all rows ────────────────────────────────────────────────
  const confirm = async () => {
    if (!suggestions || suggestions.length === 0) return;

    for (const r of suggestions) {
      if (r.weight && (isNaN(+r.weight) || +r.weight < 0)) {
        Alert.alert('Check your numbers', `${r.name}: weight must be 0 or higher.`);
        return;
      }
      if (r.reps && (isNaN(+r.reps) || +r.reps < 1)) {
        Alert.alert('Check your numbers', `${r.name}: reps must be a positive number.`);
        return;
      }
    }

    setSaving(true);
    let addedCount = 0;
    try {
      for (const r of suggestions) {
        const setCount = Math.max(1, Math.min(100, Number(r.sets) || 1));
        const reps = r.reps ? Number(r.reps) : null;
        const weight = r.weight ? Number(r.weight) : null;
        await workoutApi.create({
          name:  r.name,
          date,
          unit:  r.unit,
          sets:  Array.from({ length: setCount }, () => ({ reps, weight })),
          exerciseDefId: r.exerciseDefId,
        });
        addedCount++;
      }
      haptics.success();
      navigation.goBack();
    } catch (e) {
      haptics.warning();
      Alert.alert(
        'Partially saved',
        `Added ${addedCount} of ${suggestions.length} exercises before hitting an error: ` +
          `${(e as Error).message ?? 'unknown error'}. The rest were not added.`,
      );
      if (addedCount > 0) navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={96}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.datePill}>
            <Feather name="calendar" size={13} color={colors.primary} />
            <Text style={styles.datePillText}>
              {dayFull}, {parseDateStr(date).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={formStyles.label}>What do you want to train?</Text>
            <TextInput
              style={[formStyles.input, styles.promptInput]}
              value={prompt}
              onChangeText={setPrompt}
              placeholder="e.g. Push day focused on shoulders, 4 exercises"
              placeholderTextColor={colors.textMuted}
              multiline
              returnKeyType="default"
              maxLength={500}
            />

            <View style={styles.chipsRow}>
              {QUICK_PROMPTS.map(q => (
                <TouchableOpacity
                  key={q}
                  style={styles.chip}
                  onPress={() => { haptics.tap(); setPrompt(q); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <GradientButton
              title={generating ? 'Generating...' : 'Generate'}
              icon="zap"
              onPress={generate}
              loading={generating}
              style={styles.generateBtn}
            />

            {/* Guideline 5.1.2(i) requires disclosing where personal data
                goes to a third-party AI, at the point it happens rather
                than only in the privacy policy. The health disclaimer is
                here for 1.4.1: generated training advice is not medical
                advice, and this is the screen that generates it. */}
            <Text style={styles.aiDisclaimer}>
              Your request and a summary of your last 30 days of training are sent to Google's
              Gemini API to generate this. Suggestions are informational only — not medical or
              professional training advice. Check anything new against your own judgement, and
              consult a professional before changing how you train.
            </Text>
          </View>

          {suggestions && (
            <View style={styles.sectionCard}>
              <View style={styles.setsHeader}>
                <Text style={formStyles.label}>Suggested Exercises</Text>
                <View style={styles.setsCountBubble}>
                  <Text style={styles.setsCount}>{suggestions.length}</Text>
                </View>
              </View>

              <Text style={styles.weightExplainer}>
                Sets and reps are the AI's suggestion. Weight is pulled from your last logged set
                for each exercise, not guessed by the AI. Blank means you haven't logged it yet.
              </Text>

              {suggestions.map((row, i) => (
                <View key={`${row.exerciseDefId}-${i}`} style={styles.suggestionBlock}>
                  <View style={styles.suggestionHeader}>
                    <View style={styles.suggestionHeaderText}>
                      <Text style={styles.suggestionName}>{row.name}</Text>
                      <Text style={styles.suggestionMuscle}>{muscleGroupLabel(row.muscleGroup)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeRow(i)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="x" size={17} color={colors.danger} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.suggestionRowInputs}>
                    <View style={styles.suggestionField}>
                      <Text style={styles.suggestionFieldLabel}>Sets</Text>
                      <TextInput
                        {...chain.inputProps(`sets-${i}`)}
                        style={[formStyles.input, styles.suggestionInput]}
                        value={row.sets}
                        onChangeText={v => updateRow(i, 'sets', v)}
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={styles.suggestionField}>
                      <Text style={styles.suggestionFieldLabel}>Weight ({row.unit})</Text>
                      <TextInput
                        {...chain.inputProps(`weight-${i}`)}
                        style={[formStyles.input, styles.suggestionInput]}
                        value={row.weight}
                        onChangeText={v => updateRow(i, 'weight', v)}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.suggestionField}>
                      <Text style={styles.suggestionFieldLabel}>Reps</Text>
                      <TextInput
                        {...chain.inputProps(`reps-${i}`)}
                        style={[formStyles.input, styles.suggestionInput]}
                        value={row.reps}
                        onChangeText={v => updateRow(i, 'reps', v)}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>

                  {!row.hasHistory && (
                    <View style={styles.noHistoryHint}>
                      <Feather name="info" size={11} color={colors.textMuted} />
                      <Text style={styles.noHistoryHintText}>
                        Never logged before. Enter your own weight.
                      </Text>
                    </View>
                  )}

                  {row.notes ? <Text style={styles.suggestionNotes}>{row.notes}</Text> : null}
                </View>
              ))}

              <GradientButton
                title={saving ? 'Adding...' : `Add ${suggestions.length} Exercise${suggestions.length === 1 ? '' : 's'} to Today`}
                onPress={confirm}
                loading={saving}
                disabled={suggestions.length === 0}
                style={styles.confirmBtn}
              />
            </View>
          )}

          {generating && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Building your workout...</Text>
            </View>
          )}
        </ScrollView>

        {/* Sits on top of the keypad: the KeyboardAvoidingView's padding
            lifts its last child to the keyboard's edge. */}
        {chain.bar && <KeyboardFieldBar {...chain.bar} />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  scroll: { flex: 1 },
  content: {
    padding:       16,
    paddingBottom: 40,
  },
  datePill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               7,
    alignSelf:         'flex-start',
    backgroundColor:   colors.primaryBg,
    borderRadius:      RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical:    7,
    marginBottom:      16,
    borderWidth:        1,
    borderColor:        colors.primary,
  },
  datePillText: {
    fontFamily: FONT.semibold,
    color:      colors.primary,
    fontSize:   13,
  },
  sectionCard: {
    backgroundColor: colors.bgAlt,
    borderRadius:    RADIUS.lg,
    borderWidth:      1,
    borderColor:      colors.cardBorder,
    padding:         16,
    marginBottom:    14,
  },
  promptInput: {
    height:            84,
    textAlignVertical: 'top',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
    marginBottom:  16,
  },
  chip: {
    backgroundColor:   colors.card,
    borderRadius:      RADIUS.pill,
    borderWidth:        1,
    borderColor:        colors.border,
    paddingHorizontal: 12,
    paddingVertical:    7,
  },
  chipText: {
    fontFamily: FONT.medium,
    fontSize:   12,
    color:      colors.textSub,
  },
  generateBtn: {
    marginTop: 0,
  },
  aiDisclaimer: {
    marginTop:  14,
    fontSize:   11,
    lineHeight: 16,
    color:      colors.textMuted,
  },
  loadingWrap: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical: 20,
  },
  loadingText: {
    fontFamily: FONT.medium,
    fontSize:   13,
    color:      colors.textMuted,
  },
  setsHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  setsCountBubble: {
    backgroundColor:   colors.primaryBg,
    borderRadius:      RADIUS.pill,
    minWidth:          24,
    height:            24,
    paddingHorizontal: 7,
    alignItems:        'center',
    justifyContent:    'center',
    marginBottom:      8,
  },
  setsCount: {
    fontFamily: FONT.bold,
    fontSize:   12,
    color:      colors.primary,
  },
  weightExplainer: {
    fontFamily:   FONT.medium,
    fontSize:     12,
    color:        colors.textMuted,
    lineHeight:   17,
    marginBottom: 12,
  },
  noHistoryHint: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    marginTop:     8,
  },
  noHistoryHintText: {
    fontFamily: FONT.medium,
    fontSize:   11,
    color:      colors.textMuted,
  },
  suggestionBlock: {
    backgroundColor: colors.card,
    borderRadius:    RADIUS.md,
    borderWidth:      1,
    borderColor:      colors.border,
    padding:         12,
    marginBottom:    10,
  },
  suggestionHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   10,
  },
  suggestionHeaderText: {
    flex: 1,
  },
  suggestionName: {
    fontFamily: FONT.semibold,
    fontSize:   15,
    color:      colors.text,
  },
  suggestionMuscle: {
    fontFamily: FONT.medium,
    fontSize:   12,
    color:      colors.textMuted,
    marginTop:   2,
  },
  removeBtn: {
    width:           30,
    height:          30,
    borderRadius:    RADIUS.sm,
    backgroundColor: colors.dangerBg,
    alignItems:      'center',
    justifyContent:  'center',
  },
  suggestionRowInputs: {
    flexDirection: 'row',
    gap:           8,
  },
  suggestionField: {
    flex: 1,
  },
  suggestionFieldLabel: {
    fontFamily:    FONT.medium,
    fontSize:      10,
    color:         colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom:   6,
  },
  suggestionInput: {
    paddingVertical: 10,
    marginBottom:    0,
    textAlign:       'center',
  },
  suggestionNotes: {
    fontFamily: FONT.medium,
    fontSize:   12,
    color:      colors.textMuted,
    marginTop:   8,
    fontStyle:  'italic',
  },
  confirmBtn: {
    marginTop: 4,
  },
});
