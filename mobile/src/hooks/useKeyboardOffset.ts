import { useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

// Used until the real position is measured: the old hardcoded offset, which
// is right for a standard header and only a little short on taller ones.
const FALLBACK_OFFSET = 96;
// A screen can lay out before it's attached to the window, when it measures
// at y = 0. Retry on the next frames rather than trust that.
const MAX_MEASURE_ATTEMPTS = 10;

/** `keyboardVerticalOffset` for a KeyboardAvoidingView under a stack header.
 *
 *  KeyboardAvoidingView measures itself relative to its parent, so the
 *  offset has to be how far that parent sits from the top of the window,
 *  which is the header height. A hardcoded guess is short on taller
 *  headers, which lets the keypad cover the bottom of the screen and the
 *  Back/Next/Done bar. Put `onLayout` on the view that wraps the
 *  KeyboardAvoidingView and pass `offset` through. Only for screens that
 *  have a header: y = 0 is treated as "not on screen yet". */
export function useKeyboardOffset() {
  const [offset, setOffset] = useState(FALLBACK_OFFSET);

  const onLayout = (e: LayoutChangeEvent) => {
    const view = e.currentTarget;
    const measure = (attempt: number) => {
      view.measureInWindow((_x, y) => {
        if (y > 0) {
          // Rounded so sub-point jitter doesn't re-render for nothing.
          const next = Math.round(y);
          setOffset(prev => (prev === next ? prev : next));
        } else if (attempt < MAX_MEASURE_ATTEMPTS) {
          requestAnimationFrame(() => measure(attempt + 1));
        }
      });
    };
    measure(1);
  };

  return { onLayout, offset };
}
