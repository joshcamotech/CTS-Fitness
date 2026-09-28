import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert,
  KeyboardAvoidingView, Keyboard, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

import { ColorTokens } from '../theme/colorways';
import { useTheme } from '../theme/ThemeContext';
import { FONT, RADIUS } from '../constants/theme';
import { useFormStyles } from '../constants/formStyles';
import { RootStackParamList, WeightUnit, ExerciseDef, Exercise } from '../types';
import { workoutApi, catalogApi, SetInput, SetPrResult, ExercisePr, LastWorkingSet } from '../services/api';
import { GradientButton } from '../components/GradientButton';
import { ExercisePickerModal } from '../components/ExercisePickerModal';
import { SupersetPickerModal } from '../components/SupersetPickerModal';
import { RestTimer } from '../components/RestTimer';
import { WarmupSuggestion } from '../components/WarmupSuggestion';
import { KeyboardFieldBar } from '../components/KeyboardFieldBar';
import { useFieldChain } from '../hooks/useFieldChain';
import { haptics } from '../utils/haptics';
import { parseDateStr } from '../utils/dateUtils';

type Nav   = NativeStackNavigationProp<RootStackParamList, 'AddExercise'>;
type Route = RouteProp<RootStackParamList, 'AddExercise'>;
interface Props { navigation: Nav; route: Route }

/** A drop performed immediately after a set, no rest between, same
 *  string-controlled shape as a set row, minus id (drops are never
 *  independently addressable) and never PR-eligible. */
interface DropRow {
  reps:   string;
  weight: string;
}

/** A row in the per-set editor: strings so the input controls them.
 *  `id` (the underlying exercise_sets.id) is carried through so a live
 *  record badge stays attached to the right row even if earlier rows are
 *  added/removed before saving; new/unsaved rows have no id yet. */
interface SetRow {
  id?:    number;
  reps:   string;
  weight: string;
  drops:  DropRow[];
}

const emptyRow = (): SetRow => ({ reps: '', weight: '', drops: [] });

export function AddExerciseScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useFormStyles();
  const { date, dayFull, editExercise, initialMuscleGroup } = route.params;
  const isEditing = !!editExercise;

  // The chosen catalog/custom exercise. When editing a legacy entry that
  // predates the catalog (exercise_def_id null), this starts null and the
  // user must pick: the old free-text name is shown as a hint.
  const [selectedDef, setSelectedDef] = useState<{ id: number; name: string } | null>(
    editExercise?.exercise_def_id != null
      ? { id: editExercise.exercise_def_id, name: editExercise.name }
      : null
  );
  const [unit,  setUnit]  = useState<WeightUnit>(editExercise?.unit ?? 'KG');
  const [notes, setNotes] = useState(editExercise?.notes ?? '');
  // Current best for the selected exercise ("Current PR: 60 KG × 5").
  const [currentPr, setCurrentPr] = useState<ExercisePr | null>(null);
  // Heaviest set from the last time this exercise was logged. Backs the
  // "Suggested Warm-up" ramp shown above the set editor.
  const [lastWorkingSet, setLastWorkingSet] = useState<LastWorkingSet | null>(null);

  // Superset partner: another exercise logged the same day. `name` is
  // carried alongside the id purely for display in the picker field.
  const initialPartnerId = editExercise?.superset_partner_id ?? null;
  const [supersetPartner, setSupersetPartner] = useState<{ id: number; name: string } | null>(null);
  const [dayExercises, setDayExercises] = useState<Exercise[]>([]);
  const [supersetPickerVisible, setSupersetPickerVisible] = useState(false);

  // Initialise sets: from existing exercise if editing, else one empty row
  const [setRows, setSetRows] = useState<SetRow[]>(() => {
    if (editExercise && editExercise.sets.length > 0) {
      return editExercise.sets.map(s => ({
        id:     s.id,
        reps:   s.reps   != null ? String(s.reps)   : '',
        weight: s.weight != null ? String(s.weight) : '',
        drops:  (s.drops ?? []).map(d => ({
          reps:   d.reps   != null ? String(d.reps)   : '',
          weight: d.weight != null ? String(d.weight) : '',
        })),
      }));
    }
    return [emptyRow()];
  });

  const [saving,        setSaving]        = useState(false);
  // Jump straight into the picker, pre-filtered, when arriving from a
  // muscle-group recommendation (e.g. the dashboard's Today's Focus card)
  // rather than requiring an extra tap, but not when editing an exercise
  // that's already chosen.
  const [pickerVisible, setPickerVisible] = useState(!selectedDef && !!initialMuscleGroup);
  const [prSets,        setPrSets]        = useState<SetPrResult[]>([]);
  // set ids that are *currently* record holders (live, from exercise_set_pr_flags),
  // separate from prSets above, which only reflects the moment a save just happened.
  const [recordSetIds, setRecordSetIds] = useState<Set<number>>(new Set());

  // Fetch the current PR for whatever exercise is selected: the small
  // "Current PR" chip under the picker field. Best-effort: a failure just
  // means no chip.
  useEffect(() => {
    if (!selectedDef) { setCurrentPr(null); return; }
    let stale = false;
    catalogApi.getPr(selectedDef.id)
      .then(pr => { if (!stale) setCurrentPr(pr); })
      .catch(() => { if (!stale) setCurrentPr(null); });
    return () => { stale = true; };
  // Keyed on the id, not the object: `selectedDef` gets a new identity on
  // every picker render, and depending on it would refetch needlessly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDef?.id]);

  // Fetch the reference weight for the "Suggested Warm-up" ramp: best-effort,
  // same as the PR chip above.
  useEffect(() => {
    if (!selectedDef) { setLastWorkingSet(null); return; }
    let stale = false;
    catalogApi.getLastWorkingSet(selectedDef.id)
      .then(s => { if (!stale) setLastWorkingSet(s); })
      .catch(() => { if (!stale) setLastWorkingSet(null); });
    return () => { stale = true; };
  // Keyed on the id, not the object: `selectedDef` gets a new identity on
  // every picker render, and depending on it would refetch needlessly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDef?.id]);

  // Load this day's other exercises for the superset picker, and resolve
  // the current partner's name for display (best-effort: a failed fetch
  // just leaves the picker with nothing to offer).
  useEffect(() => {
    workoutApi.getByDate(date)
      .then(list => {
        const others = list.filter(e => e.id !== editExercise?.id);
        setDayExercises(others);
        if (initialPartnerId != null) {
          const partner = others.find(e => e.id === initialPartnerId);
          if (partner) setSupersetPartner({ id: partner.id, name: partner.name });
        }
      })
      .catch(() => {});
  }, [date, editExercise?.id, initialPartnerId]);

  // Load live "currently a record" flags for the sets being edited. A brand-new
  // exercise has no prior sets to check, so this only applies when editing.
  useEffect(() => {
    if (!isEditing || !editExercise) return;
    workoutApi.getSetRecordFlags(editExercise.id).then(flags => {
      const ids = flags
        .filter(f => f.is_weight_pr || f.is_e1rm_pr)
        .map(f => f.set_id);
      setRecordSetIds(new Set(ids));
    }).catch(() => {
      // Best-effort: a failed fetch here just means no live badges show, it
      // shouldn't block editing/saving the exercise.
    });
  }, [isEditing, editExercise]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Edit Exercise' : 'Add Exercise',
    });
  }, [navigation, isEditing]);

  // ── Keyboard Back/Next chaining ──────────────────────────────
  // Every weight/reps box in visual order: weight then reps (the order you
  // actually log a set), through a set's drops, then into the next set.
  const fieldKeys = setRows.flatMap((row, i) => [
    `weight-${i}`, `reps-${i}`,
    ...row.drops.flatMap((_, di) => [`drop-weight-${i}-${di}`, `drop-reps-${i}-${di}`]),
  ]);
  const chain = useFieldChain(fieldKeys);

  // ── Set row helpers ──────────────────────────────────────────
  const updateRow = (index: number, field: 'reps' | 'weight', value: string) => {
    setSetRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    if (setRows.length >= 100) return;
    haptics.tap();
    setSetRows(prev => [...prev, emptyRow()]);
  };

  const removeRow = (index: number) => {
    if (setRows.length <= 1) return; // keep at least one
    haptics.tap();
    setSetRows(prev => prev.filter((_, i) => i !== index));
  };

  // ── Drop row helpers ─────────────────────────────────────────
  const addDrop = (rowIndex: number) => {
    haptics.tap();
    setSetRows(prev => prev.map((r, i) =>
      i === rowIndex ? { ...r, drops: [...r.drops, { reps: '', weight: '' }] } : r
    ));
  };

  const removeDrop = (rowIndex: number, dropIndex: number) => {
    haptics.tap();
    setSetRows(prev => prev.map((r, i) =>
      i === rowIndex ? { ...r, drops: r.drops.filter((_, di) => di !== dropIndex) } : r
    ));
  };

  const updateDrop = (rowIndex: number, dropIndex: number, field: keyof DropRow, value: string) => {
    setSetRows(prev => prev.map((r, i) =>
      i === rowIndex
        ? { ...r, drops: r.drops.map((d, di) => di === dropIndex ? { ...d, [field]: value } : d) }
        : r
    ));
  };

  const selectUnit = (u: WeightUnit) => {
    haptics.tap();
    setUnit(u);
  };

  // ── Validation ───────────────────────────────────────────────
  const validate = (): string | null => {
    if (!selectedDef) return 'Please choose an exercise from the catalog.';
    if (setRows.length === 0) return 'Add at least one set.';

    for (let i = 0; i < setRows.length; i++) {
      const r = setRows[i];
      const setLabel = `Set ${i + 1}`;
      // Weight is optional (bodyweight exercises). But if entered, must be valid.
      if (r.weight && (isNaN(+r.weight) || +r.weight < 0)) {
        return `${setLabel}: weight must be 0 or higher.`;
      }
      if (r.reps && (isNaN(+r.reps) || +r.reps < 1)) {
        return `${setLabel}: reps must be a positive number.`;
      }
      // At least one of reps or weight should be filled, otherwise it's an empty set
      if (!r.reps && !r.weight) {
        return `${setLabel}: enter at least reps or weight.`;
      }

      for (let di = 0; di < r.drops.length; di++) {
        const d = r.drops[di];
        if (!d.reps && !d.weight) continue; // untouched drop row, dropped silently on save
        const dropLabel = `${setLabel}, Drop ${di + 1}`;
        if (d.weight && (isNaN(+d.weight) || +d.weight < 0)) {
          return `${dropLabel}: weight must be 0 or higher.`;
        }
        if (d.reps && (isNaN(+d.reps) || +d.reps < 1)) {
          return `${dropLabel}: reps must be a positive number.`;
        }
      }
    }
    return null;
  };

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    const err = validate();
    if (err) { Alert.alert('Missing info', err); return; }

    setSaving(true);
    try {
      const sets: SetInput[] = setRows.map(r => ({
        reps:   r.reps   ? Number(r.reps)   : null,
        weight: r.weight ? Number(r.weight) : null,
        // Untouched drop rows (both fields blank) are dropped here rather
        // than blocked at validation. Tapping "Add Drop" then changing
        // your mind shouldn't require removing the row by hand.
        drops: r.drops
          .filter(d => d.reps || d.weight)
          .map(d => ({
            reps:   d.reps   ? Number(d.reps)   : null,
            weight: d.weight ? Number(d.weight) : null,
          })),
      }));

      const payload = {
        name:  selectedDef!.name,
        date,
        unit,
        notes: notes.trim() || null,
        sets,
        exerciseDefId: selectedDef!.id,
      };

      const { exercise: savedExercise, prSets: newPrSets } = isEditing && editExercise
        ? await workoutApi.update(editExercise.id, payload)
        : await workoutApi.create(payload);

      const partnerId = supersetPartner?.id ?? null;
      if (partnerId !== initialPartnerId) {
        await workoutApi.setSupersetPartner(savedExercise.id, partnerId);
      }

      haptics.success();

      const hasPr = newPrSets.some(s => s.is_weight_pr || s.is_e1rm_pr);
      if (hasPr) {
        // Save has already completed. This is a deliberate pause so the
        // PR badge is visible before the screen navigates away, not added
        // latency on the save itself.
        setPrSets(newPrSets);
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', (e as Error).message ?? 'Could not save exercise. Check your connection.');
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
          {/* Date chip */}
          <View style={styles.datePill}>
            <Feather name="calendar" size={13} color={colors.primary} />
            <Text style={styles.datePillText}>
              {dayFull}, {parseDateStr(date).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
          </View>

          {/* ── Exercise card ── */}
          <View style={styles.sectionCard}>
            <Text style={formStyles.label}>Exercise</Text>
            <TouchableOpacity
              style={styles.pickerField}
              onPress={() => {
                haptics.tap();
                Keyboard.dismiss();
                setPickerVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Feather name="grid" size={15} color={colors.primary} />
              <Text style={selectedDef ? styles.pickerFieldText : styles.pickerFieldPlaceholder}>
                {selectedDef
                  ? selectedDef.name
                  : editExercise
                    ? `Pick the catalog exercise for "${editExercise.name}"`
                    : 'Choose an exercise'}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {currentPr?.best_weight ? (
              <View style={styles.prChip}>
                <Feather name="award" size={12} color={colors.success} />
                <Text style={styles.prChipText}>
                  Current PR: {currentPr.best_weight.weight} {currentPr.best_weight.unit}
                  {currentPr.best_weight.reps != null ? ` × ${currentPr.best_weight.reps}` : ''}
                </Text>
              </View>
            ) : null}

            {/* Unit toggle (KG / LBS) */}
            <Text style={formStyles.label}>Weight Unit</Text>
            <View style={styles.unitToggle}>
              {(['KG', 'LBS'] as WeightUnit[]).map(u => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                  onPress={() => selectUnit(u)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.unitBtnText, unit === u && styles.unitBtnTextActive]}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Superset partner */}
            <Text style={formStyles.label}>
              Superset With <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TouchableOpacity
              style={styles.pickerField}
              onPress={() => {
                haptics.tap();
                Keyboard.dismiss();
                setSupersetPickerVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Feather name="link" size={15} color={colors.primary} />
              <Text style={supersetPartner ? styles.pickerFieldText : styles.pickerFieldPlaceholder}>
                {supersetPartner ? supersetPartner.name : 'None'}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {lastWorkingSet && (
            <WarmupSuggestion
              workingWeight={lastWorkingSet.weight}
              workingUnit={lastWorkingSet.unit}
              targetUnit={unit}
            />
          )}

          {/* ── Sets card ── */}
          <View style={styles.sectionCard}>
            <View style={styles.setsHeader}>
              <Text style={formStyles.label}>Sets</Text>
              <View style={styles.setsCountBubble}>
                <Text style={styles.setsCount}>{setRows.length}</Text>
              </View>
            </View>

            {/* Column headings */}
            <View style={styles.setRowHeader}>
              <Text style={[styles.setRowHeaderText, { width: 36 }]}>#</Text>
              <Text style={[styles.setRowHeaderText, { flex: 1 }]}>Weight ({unit})</Text>
              <Text style={[styles.setRowHeaderText, { flex: 1 }]}>Reps</Text>
              <View style={{ width: 36 }} />
            </View>

            {/* The set rows */}
            {setRows.map((row, i) => {
              const pr = prSets.find(s => s.set_number === i + 1);
              const isPr = (!!pr && (pr.is_weight_pr || pr.is_e1rm_pr))
                || (row.id != null && recordSetIds.has(row.id));
              return (
              <View key={i} style={styles.setBlock}>
                <View style={styles.setRow}>
                  <View style={styles.setNumberBadge}>
                    <Text style={styles.setNumber}>{i + 1}</Text>
                    {isPr && (
                      <View style={styles.prBadge}>
                        <Feather name="award" size={11} color="#FFFFFF" />
                      </View>
                    )}
                  </View>

                  <TextInput
                    {...chain.inputProps(`weight-${i}`)}
                    style={[formStyles.input, styles.setInput]}
                    value={row.weight}
                    onChangeText={v => updateRow(i, 'weight', v)}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />

                  <TextInput
                    {...chain.inputProps(`reps-${i}`)}
                    style={[formStyles.input, styles.setInput]}
                    value={row.reps}
                    onChangeText={v => updateRow(i, 'reps', v)}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                  />

                  <TouchableOpacity
                    style={[styles.removeBtn, setRows.length <= 1 && styles.removeBtnDisabled]}
                    onPress={() => removeRow(i)}
                    disabled={setRows.length <= 1}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="minus" size={17} color={colors.danger} />
                  </TouchableOpacity>
                </View>

                {row.drops.map((drop, di) => (
                  <View key={di} style={styles.dropRow}>
                    <View style={styles.dropConnector}>
                      <Feather name="corner-down-right" size={14} color={colors.textMuted} />
                    </View>

                    <TextInput
                      {...chain.inputProps(`drop-weight-${i}-${di}`)}
                      style={[formStyles.input, styles.setInput, styles.dropInput]}
                      value={drop.weight}
                      onChangeText={v => updateDrop(i, di, 'weight', v)}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                    />

                    <TextInput
                      {...chain.inputProps(`drop-reps-${i}-${di}`)}
                      style={[formStyles.input, styles.setInput, styles.dropInput]}
                      value={drop.reps}
                      onChangeText={v => updateDrop(i, di, 'reps', v)}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                    />

                    <TouchableOpacity
                      style={styles.removeDropBtn}
                      onPress={() => removeDrop(i, di)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="x" size={14} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.addDropBtn}
                  onPress={() => addDrop(i)}
                  activeOpacity={0.7}
                >
                  <Feather name="corner-down-right" size={12} color={colors.primary} />
                  <Text style={styles.addDropBtnText}>Add Drop</Text>
                </TouchableOpacity>
              </View>
              );
            })}

            {/* Add set button */}
            <TouchableOpacity
              style={styles.addSetBtn}
              onPress={addRow}
              activeOpacity={0.7}
              disabled={setRows.length >= 100}
            >
              <Feather name="plus" size={15} color={colors.primary} />
              <Text style={styles.addSetBtnText}>Add Set</Text>
            </TouchableOpacity>
          </View>

          <RestTimer />

          {/* ── Notes card ── */}
          <View style={styles.sectionCard}>
            <Text style={formStyles.label}>
              Notes <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={[formStyles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Felt strong today, paused reps"
              placeholderTextColor={colors.textMuted}
              multiline
              returnKeyType="default"
              maxLength={500}
            />
          </View>

          {/* ── Save button ── */}
          <GradientButton
            title={isEditing ? 'Save Changes' : 'Log Exercise'}
            onPress={handleSave}
            loading={saving}
            style={styles.saveBtn}
          />
        </ScrollView>

        {/* Sits on top of the keypad: the KeyboardAvoidingView's padding
            lifts its last child to the keyboard's edge. */}
        {chain.bar && <KeyboardFieldBar {...chain.bar} />}
      </KeyboardAvoidingView>

      <ExercisePickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(def: ExerciseDef) => {
          setSelectedDef({ id: def.id, name: def.name });
          setPickerVisible(false);
        }}
        initialGroup={initialMuscleGroup}
      />

      <SupersetPickerModal
        visible={supersetPickerVisible}
        exercises={dayExercises}
        onClose={() => setSupersetPickerVisible(false)}
        onSelect={setSupersetPartner}
      />
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
  pickerField: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    backgroundColor:   colors.card,
    borderRadius:      RADIUS.md,
    borderWidth:        1,
    borderColor:        colors.border,
    paddingHorizontal: 14,
    paddingVertical:   14,
    marginBottom:      12,
  },
  pickerFieldText: {
    flex:       1,
    fontFamily: FONT.semibold,
    fontSize:   15,
    color:      colors.text,
  },
  pickerFieldPlaceholder: {
    flex:       1,
    fontFamily: FONT.medium,
    fontSize:   14,
    color:      colors.textMuted,
  },
  prChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    alignSelf:         'flex-start',
    backgroundColor:   colors.successBg,
    borderRadius:      RADIUS.pill,
    borderWidth:        1,
    borderColor:        colors.success,
    paddingHorizontal: 10,
    paddingVertical:    4,
    marginBottom:      12,
  },
  prChipText: {
    fontFamily: FONT.bold,
    fontSize:   12,
    color:      colors.success,
  },
  optional: {
    color:         colors.textMuted,
    textTransform: 'none',
  },
  unitToggle: {
    flexDirection:   'row',
    backgroundColor: colors.card,
    borderRadius:    RADIUS.md,
    borderWidth:      1,
    borderColor:      colors.border,
    padding:          4,
    alignSelf:       'flex-start',
    marginBottom:    12,
  },
  unitBtn: {
    paddingHorizontal: 20,
    paddingVertical:   10,
    minWidth:          64,
    alignItems:        'center',
    borderRadius:      RADIUS.sm,
  },
  unitBtnActive: {
    backgroundColor: colors.primary,
  },
  unitBtnText: {
    fontFamily: FONT.bold,
    fontSize:   14,
    color:      colors.textMuted,
  },
  unitBtnTextActive: {
    color: '#FFFFFF',
  },
  // ── Sets section ──
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
  setRowHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  6,
  },
  setRowHeaderText: {
    fontFamily:    FONT.medium,
    fontSize:      10,
    color:         colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign:     'center',
  },
  setBlock: {
    marginBottom: 10,
  },
  setRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  6,
  },
  setNumberBadge: {
    width:           36,
    height:          36,
    borderRadius:    RADIUS.sm,
    backgroundColor: colors.card,
    borderWidth:      1,
    borderColor:      colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  prBadge: {
    position:        'absolute',
    top:              -6,
    right:            -6,
    width:            18,
    height:           18,
    borderRadius:     9,
    backgroundColor:  colors.success,
    borderWidth:       2,
    borderColor:       colors.bgAlt,
    alignItems:       'center',
    justifyContent:   'center',
  },
  setNumber: {
    fontFamily: FONT.bold,
    fontSize:   14,
    color:      colors.textSub,
  },
  setInput: {
    flex:            1,
    marginBottom:    0,
    paddingVertical: 12,
    textAlign:       'center',
  },
  dropRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginLeft:    36,
    marginBottom:  6,
  },
  dropConnector: {
    width:      28,
    alignItems: 'center',
  },
  dropInput: {
    paddingVertical: 9,
    fontSize:        14,
  },
  removeDropBtn: {
    width:           28,
    height:          28,
    borderRadius:    RADIUS.sm,
    backgroundColor: colors.dangerBg,
    alignItems:      'center',
    justifyContent:  'center',
  },
  addDropBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    marginLeft:    36,
  },
  addDropBtnText: {
    fontFamily: FONT.semibold,
    fontSize:   12,
    color:      colors.primary,
  },
  removeBtn: {
    width:           36,
    height:          36,
    borderRadius:    RADIUS.sm,
    backgroundColor: colors.dangerBg,
    alignItems:      'center',
    justifyContent:  'center',
  },
  removeBtnDisabled: {
    opacity: 0.3,
  },
  addSetBtn: {
    flexDirection:   'row',
    gap:             6,
    marginTop:       8,
    paddingVertical: 12,
    borderRadius:    RADIUS.md,
    borderWidth:      1,
    borderStyle:     'dashed',
    borderColor:      colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  addSetBtnText: {
    fontFamily:    FONT.bold,
    fontSize:      14,
    color:         colors.primary,
    letterSpacing: 0.4,
  },
  notesInput: {
    height:            90,
    textAlignVertical: 'top',
    marginBottom:      0,
  },
  saveBtn: {
    marginTop: 4,
  },
});
