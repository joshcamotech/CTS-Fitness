import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, TextInput } from 'react-native';

// How long a blur waits for another chained box to take focus before the
// bar hides. Tapping Next or another box blurs one input and focuses the
// next in the same native turn, so this only has to cover event delivery.
const BLUR_GRACE_MS = 80;

/** Back/Next focus chaining across a screen's numeric inputs.
 *
 *  `keys` lists every input in visual order and is rebuilt each render, so
 *  adding or removing rows just changes the list. Each input registers its
 *  ref under its key; `next`/`prev` step through the list from a given key.
 *
 *  `bar` is the Back/Next handlers for whichever chained input has focus,
 *  or null when none does. Screens render
 *  `{chain.bar && <KeyboardFieldBar {...chain.bar} />}` as the last child
 *  of their KeyboardAvoidingView. This deliberately does not use iOS
 *  InputAccessoryView: on RN 0.86 (New Architecture) it attaches only once
 *  per mount, and a recycled TextInput that gets the same
 *  inputAccessoryViewID as its previous life never re-applies it, so the
 *  bar silently vanishes after a screen has been opened once. */
export function useFieldChain(keys: string[]) {
  const refs = useRef<Record<string, TextInput | null>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const focusedRef = useRef<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Blur doesn't fire when the focused input unmounts (e.g. its row is
  // removed), which would leave the bar up with no keypad. The keypad
  // hiding is the backstop: nothing is being typed into after that.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardWillHide', () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      blurTimer.current = null;
      focusedRef.current = null;
      setActiveKey(null);
    });
    return () => {
      sub.remove();
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const register = (key: string) => (el: TextInput | null) => { refs.current[key] = el; };

  const indexOf = (key: string) => keys.indexOf(key);

  const hasPrev = (key: string) => indexOf(key) > 0;
  const hasNext = (key: string) => {
    const i = indexOf(key);
    return i >= 0 && i < keys.length - 1;
  };

  const prev = (key: string) => {
    if (!hasPrev(key)) return;
    refs.current[keys[indexOf(key) - 1]]?.focus();
  };

  // Past the last input there's nowhere to go, so close the keypad. This
  // is also what Android's keyboard next key does on the final box.
  const next = (key: string) => {
    if (!hasNext(key)) {
      Keyboard.dismiss();
      return;
    }
    refs.current[keys[indexOf(key) + 1]]?.focus();
  };

  const onFocus = (key: string) => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    focusedRef.current = key;
    setActiveKey(key);
  };

  // Hide on a short delay so moving between boxes doesn't flash the bar
  // off and on (which would also jump the scroll view by the bar's height).
  const onBlur = (key: string) => {
    if (focusedRef.current !== key) return;
    focusedRef.current = null;
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      blurTimer.current = null;
      if (focusedRef.current === null) setActiveKey(null);
    }, BLUR_GRACE_MS);
  };

  /** Spread onto each chained TextInput: its ref and focus tracking, plus
   *  Android's keyboard next key. iOS gets no returnKeyType because on a
   *  number pad RN answers that with its own one-button "Next" toolbar,
   *  which would sit on top of ours. */
  const inputProps = (key: string) => ({
    ref:             register(key),
    onFocus:         () => onFocus(key),
    onBlur:          () => onBlur(key),
    blurOnSubmit:    false,
    onSubmitEditing: () => next(key),
    ...(Platform.OS === 'ios' ? {} : { returnKeyType: 'next' as const }),
  });

  // A row can be removed while one of its boxes is focused; don't keep
  // showing a bar for a key that no longer exists.
  const current = activeKey !== null && keys.includes(activeKey) ? activeKey : null;
  const bar = current === null ? null : {
    onBack: hasPrev(current) ? () => prev(current) : null,
    onNext: hasNext(current) ? () => next(current) : null,
  };

  return { bar, inputProps };
}
