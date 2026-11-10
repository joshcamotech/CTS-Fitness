import React, { useLayoutEffect, useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, Image,
  KeyboardAvoidingView, Keyboard, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

import { ColorTokens } from '../theme/colorways';
import { useTheme } from '../theme/ThemeContext';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset';
import { FONT, RADIUS } from '../constants/theme';
import { useFormStyles } from '../constants/formStyles';
import { EXERCISE_IMAGES } from '../constants/exerciseImages';
import { RootStackParamList, ExerciseDef } from '../types';
import { presetApi } from '../services/api';
import { GradientButton } from '../components/GradientButton';
import { ExercisePickerModal } from '../components/ExercisePickerModal';
import { haptics } from '../utils/haptics';

type Nav   = NativeStackNavigationProp<RootStackParamList, 'EditPreset'>;
type Route = RouteProp<RootStackParamList, 'EditPreset'>;
interface Props { navigation: Nav; route: Route }

/** Minimal shape kept for each chosen exercise: enough to render a row
 *  and to send back as an ordered id list on save. */
interface Chosen {
  id:        number;
  name:      string;
  image_key: string | null;
}

export function EditPresetScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useFormStyles();
  const keyboardOffset = useKeyboardOffset();
  const { preset } = route.params;
  const isEditing = !!preset;

  const [name, setName] = useState(preset?.name ?? '');
  const [chosen, setChosen] = useState<Chosen[]>(
    (preset?.exercises ?? []).map(e => ({
      id: e.exercise_def_id, name: e.name, image_key: e.image_key,
    }))
  );
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Edit Preset' : 'New Preset',
    });
  }, [navigation, isEditing]);

  const addExercise = (def: ExerciseDef) => {
    setPickerVisible(false);
    if (chosen.some(c => c.id === def.id)) {
      haptics.warning();
      Alert.alert('Already added', `"${def.name}" is already in this preset.`);
      return;
    }
    haptics.tap();
    setChosen(prev => [...prev, { id: def.id, name: def.name, image_key: def.image_key }]);
  };

  const removeExercise = (id: number) => {
    haptics.tap();
    setChosen(prev => prev.filter(c => c.id !== id));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= chosen.length) return;
    haptics.tap();
    setChosen(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing info', 'Give this preset a name.');
      return;
    }
    if (chosen.length === 0) {
      Alert.alert('Missing info', 'Add at least one exercise.');
      return;
    }

    setSaving(true);
    try {
      const ids = chosen.map(c => c.id);
      if (isEditing && preset) {
        await presetApi.update(preset.id, name.trim(), ids);
      } else {
        await presetApi.create(name.trim(), ids);
      }
      haptics.success();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', (e as Error).message ?? 'Could not save preset.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!preset) return;
    haptics.warning();
    Alert.alert('Delete Preset', `Delete "${preset.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text:  'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await presetApi.delete(preset.id);
            haptics.success();
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Could not delete preset. Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView
      onLayout={keyboardOffset.onLayout}
      style={styles.safe}
      edges={['bottom']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset.offset}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.sectionCard}>
            <Text style={formStyles.label}>Name</Text>
            <TextInput
              style={formStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Monday - Chest and Triceps"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              maxLength={255}
            />
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.exercisesHeader}>
              <Text style={formStyles.label}>Exercises</Text>
              <View style={styles.countBubble}>
                <Text style={styles.countText}>{chosen.length}</Text>
              </View>
            </View>

            {chosen.map((c, i) => {
              const source = c.image_key ? EXERCISE_IMAGES[c.image_key] : undefined;
              return (
                <View key={c.id} style={styles.exerciseRow}>
                  {source ? (
                    <Image source={source} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Feather name="activity" size={18} color={colors.textMuted} />
                    </View>
                  )}
                  <Text style={styles.exerciseName} numberOfLines={1}>{c.name}</Text>

                  <View style={styles.reorderBtns}>
                    <TouchableOpacity
                      style={[styles.reorderBtn, i === 0 && styles.reorderBtnDisabled]}
                      onPress={() => move(i, -1)}
                      disabled={i === 0}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="chevron-up" size={16} color={colors.textSub} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.reorderBtn, i === chosen.length - 1 && styles.reorderBtnDisabled]}
                      onPress={() => move(i, 1)}
                      disabled={i === chosen.length - 1}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="chevron-down" size={16} color={colors.textSub} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeExercise(c.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="minus" size={17} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => { haptics.tap(); Keyboard.dismiss(); setPickerVisible(true); }}
              activeOpacity={0.7}
            >
              <Feather name="plus" size={15} color={colors.primary} />
              <Text style={styles.addBtnText}>Add Exercise</Text>
            </TouchableOpacity>
          </View>

          <GradientButton
            title={isEditing ? 'Save Changes' : 'Create Preset'}
            onPress={handleSave}
            loading={saving}
            style={styles.saveBtn}
          />

          {isEditing && (
            <TouchableOpacity style={styles.deleteRow} onPress={handleDelete}>
              <Feather name="trash-2" size={15} color={colors.danger} />
              <Text style={styles.deleteRowText}>Delete Preset</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ExercisePickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={addExercise}
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
  sectionCard: {
    backgroundColor: colors.bgAlt,
    borderRadius:    RADIUS.lg,
    borderWidth:      1,
    borderColor:      colors.cardBorder,
    padding:         16,
    marginBottom:    14,
  },
  exercisesHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  countBubble: {
    backgroundColor:   colors.primaryBg,
    borderRadius:      RADIUS.pill,
    minWidth:          24,
    height:            24,
    paddingHorizontal: 7,
    alignItems:        'center',
    justifyContent:    'center',
    marginBottom:      8,
  },
  countText: {
    fontFamily: FONT.bold,
    fontSize:   12,
    color:      colors.primary,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    marginBottom:  8,
  },
  thumb: {
    width:           40,
    height:          40,
    borderRadius:    RADIUS.sm,
    backgroundColor: colors.card,
  },
  thumbFallback: {
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:     1,
    borderColor:     colors.border,
  },
  exerciseName: {
    flex:       1,
    fontFamily: FONT.medium,
    fontSize:   14,
    color:      colors.text,
  },
  reorderBtns: {
    gap: 2,
  },
  reorderBtn: {
    width:           22,
    height:          16,
    alignItems:      'center',
    justifyContent:  'center',
  },
  reorderBtnDisabled: {
    opacity: 0.25,
  },
  removeBtn: {
    width:           36,
    height:          36,
    borderRadius:    RADIUS.sm,
    backgroundColor: colors.dangerBg,
    alignItems:      'center',
    justifyContent:  'center',
  },
  addBtn: {
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
  addBtnText: {
    fontFamily:    FONT.bold,
    fontSize:      14,
    color:         colors.primary,
    letterSpacing: 0.4,
  },
  saveBtn: {
    marginTop: 4,
  },
  deleteRow: {
    flexDirection:   'row',
    gap:             7,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       20,
    paddingVertical: 12,
  },
  deleteRowText: {
    fontFamily: FONT.bold,
    fontSize:   14,
    color:      colors.danger,
  },
});
