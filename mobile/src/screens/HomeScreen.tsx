import React, { useState, useCallback, useMemo } from 'react';
import {
  View, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { ColorTokens } from '../theme/colorways';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS } from '../constants/theme';
import { RootStackParamList, MainTabParamList, DayInfo, Exercise, MuscleGroup } from '../types';
import { workoutApi } from '../services/api';
import { Logo, Wordmark } from '../components/Logo';
import { PressableScale } from '../components/PressableScale';
import { EmptyState } from '../components/EmptyState';
import { HeroCard } from '../components/HeroCard';
import { TodayFocusCard } from '../components/TodayFocusCard';
import { ActivityTrendCard } from '../components/ActivityTrendCard';
import { BodyHeatmap } from '../components/BodyHeatmap';
import { BadgesRow } from '../components/BadgesRow';
import {
  getWeekStart, getWeekDays, toDateStr,
  getDayShort, getDayFull, isToday, isPastDay,
} from '../utils/dateUtils';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'HomeTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;
interface Props { navigation: Nav }

/** The dashboard: a "week at a glance" summary, today's recommended focus,
 *  and a muscle-group heatmap. Day-by-day logging lives on the Workout tab. */
export function HomeScreen({ navigation }: Props) {
  const { colors, effectiveMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [exercises,  setExercises]  = useState<Exercise[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Always the current calendar week: the dashboard doesn't browse other
  // weeks, that's what the Workout tab is for.
  const weekStart = getWeekStart(0);
  const weekDays  = getWeekDays(weekStart);

  // ── Data loading ─────────────────────────────────────────────
  const loadData = useCallback(async (showFullLoader = false) => {
    if (showFullLoader) setLoading(true);
    setError(null);
    try {
      const start = toDateStr(weekDays[0]);
      const end   = toDateStr(weekDays[6]);
      setExercises(await workoutApi.getByRange(start, end));
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load workouts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { loadData(true); }, [loadData]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData(false);
  };

  // ── Build per-day info ────────────────────────────────────────
  const days: DayInfo[] = weekDays.map(date => {
    const ds = toDateStr(date);
    return {
      date:        ds,
      dayShort:    getDayShort(date),
      dayFull:     getDayFull(date),
      dayOfMonth:  date.getDate(),
      isToday:     isToday(date),
      isPast:      isPastDay(date),
      exercises:   exercises.filter(e => e.date === ds),
    };
  });

  const now = new Date();
  const todayDate    = toDateStr(now);
  const todayDayFull = getDayFull(now);

  const goToAddExercise = (muscleGroup?: MuscleGroup) =>
    navigation.navigate('AddExercise', { date: todayDate, dayFull: todayDayFull, initialMuscleGroup: muscleGroup });

  // ── Render ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar
        barStyle={effectiveMode === 'dark' ? 'light-content' : 'dark-content'}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <Logo size={34} />
          <Wordmark fontSize={19} letterSpacing={2} />
        </View>
        <View style={styles.headerActions}>
          <PressableScale
            onPress={() => navigation.navigate('Settings')}
            style={styles.settingsBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            pressScale={0.9}
          >
            <Feather name="settings" size={17} color={colors.textSub} />
          </PressableScale>
        </View>
      </View>

      {/* ── Body ── */}
      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <ScrollView
          contentContainerStyle={styles.errorContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          <EmptyState
            emoji="⚠️"
            message="Could not load your dashboard"
            subMessage={`${error}\n\nCheck your connection and pull to retry.`}
          />
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {/* Hero metric first, then what to do about it, then the trend,
              then the detail views, so "how am I doing" is answered before
              anything asks the user to interpret a chart. */}
          <HeroCard days={days} />
          <TodayFocusCard
            onAddExercise={goToAddExercise}
            onGenerateAi={prompt => navigation.navigate('AiWorkout', { date: todayDate, dayFull: todayDayFull, initialPrompt: prompt })}
          />
          <ActivityTrendCard />
          <BodyHeatmap onSelectMuscleGroup={goToAddExercise} />
          <BadgesRow />

          {/* Bottom breathing room */}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: 20,
    paddingTop:        10,
    paddingBottom:     16,
  },
  brand: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  headerActions: {
    flexDirection: 'row',
    gap:           10,
  },
  settingsBtn: {
    width:           38,
    height:          38,
    borderRadius:    RADIUS.pill,
    backgroundColor: colors.card,
    borderWidth:      1,
    borderColor:      colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  centred: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop:        4,
  },
  errorContent: {
    flexGrow: 1,
  },
});
