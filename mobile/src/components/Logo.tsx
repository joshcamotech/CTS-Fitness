import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

import { FONT, gradientPrimary } from '../constants/theme';
import { ColorTokens } from '../theme/colorways';
import { useTheme } from '../theme/ThemeContext';

/** CTS FITNESS two-tone brand wordmark. */
export function Wordmark({ fontSize = 22, letterSpacing = 3 }: {
  fontSize?:      number;
  letterSpacing?: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Text style={[styles.wordmark, { fontSize, letterSpacing }]}>
      CTS <Text style={styles.wordmarkAccent}>FITNESS</Text>
    </Text>
  );
}

interface LogoProps {
  /** Width/height of the square logomark (default 64) */
  size?: number;
  /** Render the wordmark underneath */
  withWordmark?: boolean;
}

/**
 * CTS Fitness logomark: a loaded barbell inside an open progress ring.
 * The 300° ring reads as "a set nearly done"; the gap sits at the bottom
 * so the mark feels like it is lifting.
 */
export const Logo = React.memo(function Logo({ size = 64, withWordmark = false }: LogoProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [gradStart, gradEnd] = gradientPrimary(colors);

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradStart} />
            <Stop offset="1" stopColor={gradEnd} />
          </LinearGradient>
        </Defs>

        {/* Progress ring: 300° arc, gap at the bottom */}
        <Path
          d="M 45 54.5 A 26 26 0 1 0 19 54.5"
          stroke="url(#brand)"
          strokeWidth={5}
          strokeLinecap="round"
          fill="none"
        />

        {/* Barbell: bar */}
        <Rect x={13} y={29.5} width={38} height={5} rx={2.5} fill={colors.text} />
        {/* Plates */}
        <Rect x={19} y={21} width={6} height={22} rx={3} fill="url(#brand)" />
        <Rect x={39} y={21} width={6} height={22} rx={3} fill="url(#brand)" />
      </Svg>

      {withWordmark && (
        <View style={styles.wordmarkGap}>
          <Wordmark />
        </View>
      )}
    </View>
  );
});

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  wordmarkGap: {
    marginTop: 14,
  },
  wordmark: {
    fontFamily: FONT.bold,
    color:      colors.text,
  },
  wordmarkAccent: {
    color: colors.primary,
  },
});
