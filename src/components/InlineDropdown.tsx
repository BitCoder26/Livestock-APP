import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text } from '../theme/text';

import { AppIcon } from './AppIcon';
import { FieldClearButton } from './FieldClearButton';
import { tokens } from '../theme/tokens';

type InlineDropdownProps<T extends string> = {
  options: readonly T[];
  value: T | null;
  onSelect: (value: T) => void;
  placeholder?: string;
  accessibilityLabel: string;
  disabled?: boolean;
  // Rendered in place of the default label when an option needs more than its
  // own text (a swatch, a species mark, a second line).
  renderLabel?: (option: T) => ReactNode;
  // How the chosen option reads on the closed field. Needed when the options
  // are ids rather than display text — without it the field would show the id.
  formatValue?: (option: T) => string;
  // What a press does when there is nothing to choose from. Opening an empty
  // panel tells the keeper nothing, so a field whose list is empty because the
  // farm hasn't been set up yet sends them to the setup screen instead. With
  // no handler an empty field simply does nothing.
  onEmptyPress?: () => void;
  // The closed field defaults to the white surface every form on this app uses.
  // Screens drawn on white (Settings) pass their own so the field still reads
  // as a field.
  fieldStyle?: StyleProp<ViewStyle>;
  onClear?: () => void;
  clearAccessibilityLabel?: string;
};

const ROW_HEIGHT = 46;
const MAX_PANEL_HEIGHT = ROW_HEIGHT * 5.5;
const GAP_FROM_FIELD = 6;

// A dropdown that opens against its own field rather than sliding a sheet up
// from the bottom of the screen. For a short list of units or routes the sheet
// was a whole-screen gesture for a two-item choice, and it hid the field the
// choice belonged to. The panel is still drawn in a Modal — that is the only
// way to escape the form's ScrollView clipping — but it is positioned from the
// field's measured window rect, so it reads as local.
export function InlineDropdown<T extends string>({
  options,
  value,
  onSelect,
  placeholder = 'Select',
  accessibilityLabel,
  disabled,
  renderLabel,
  formatValue,
  onEmptyPress,
  fieldStyle,
  onClear,
  clearAccessibilityLabel,
}: InlineDropdownProps<T>) {
  const fieldRef = useRef<View>(null);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );

  const panelHeight = Math.min(MAX_PANEL_HEIGHT, options.length * ROW_HEIGHT + 8);
  // Opens downward unless the field is low enough that the panel would run off
  // the bottom, in which case it flips above — the same rule a desktop select
  // follows.
  const opensDown = anchor ? anchor.y + anchor.height + GAP_FROM_FIELD + panelHeight <= windowHeight - 12 : true;

  const open = () => {
    if (disabled) {
      return;
    }

    if (options.length === 0) {
      onEmptyPress?.();
      return;
    }

    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  };

  return (
    <View ref={fieldRef} collapsable={false} style={[styles.field, fieldStyle, disabled && styles.fieldDisabled]}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled, expanded: anchor !== null }}
        disabled={disabled}
        onPress={open}
        style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
      >
        <Text
          style={[
            styles.fieldValue,
            !value && styles.placeholder,
            value !== null && onClear && !disabled && styles.fieldValueClearable,
          ]}
          numberOfLines={1}
        >
          {value === null ? placeholder : formatValue ? formatValue(value) : value}
        </Text>
        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
      </Pressable>
      {value !== null && onClear && !disabled ? (
        <FieldClearButton
          accessibilityLabel={clearAccessibilityLabel ?? `Clear ${accessibilityLabel.toLowerCase()}`}
          onPress={() => {
            setAnchor(null);
            onClear();
          }}
          style={styles.clearButton}
        />
      ) : null}

      <Modal animationType="none" transparent visible={anchor !== null} onRequestClose={() => setAnchor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setAnchor(null)}>
          {anchor ? (
            <View
              style={[
                styles.panel,
                {
                  left: Math.max(12, Math.min(anchor.x, windowWidth - anchor.width - 12)),
                  width: anchor.width,
                  maxHeight: panelHeight,
                  ...(opensDown
                    ? { top: anchor.y + anchor.height + GAP_FROM_FIELD }
                    : { top: Math.max(12, anchor.y - GAP_FROM_FIELD - panelHeight) }),
                },
              ]}
            >
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                {options.map((option) => {
                  const selected = option === value;

                  return (
                    <Pressable
                      key={option}
                      accessibilityLabel={option}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        onSelect(option);
                        setAnchor(null);
                      }}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    >
                      {renderLabel ? (
                        renderLabel(option)
                      ) : (
                        <Text style={[styles.rowText, selected && styles.rowTextSelected]} numberOfLines={1}>
                          {option}
                        </Text>
                      )}
                      {selected ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}


type InlineMultiDropdownProps<T extends string> = {
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  placeholder: string;
  accessibilityLabel: string;
  label?: string;
  disabled?: boolean;
  // See InlineDropdown — a press with nothing to choose from.
  onEmptyPress?: () => void;
  // Overrides how the chosen options are summarised on the closed field, for
  // lists whose names are too wide to read back two at a time.
  formatSummary?: (selected: readonly T[]) => string;
  // See InlineDropdown — a row that needs more than its own text.
  renderLabel?: (option: T) => ReactNode;
  // See InlineDropdown — the closed field's surface.
  fieldStyle?: StyleProp<ViewStyle>;
  onClear?: () => void;
  clearAccessibilityLabel?: string;
};

// The many-choice sibling of InlineDropdown. Rows toggle rather than commit, so
// the panel stays open until the keeper taps away — closing on the first tap
// would make picking three record types a three-trip job.
export function InlineMultiDropdown<T extends string>({
  options,
  selected,
  onToggle,
  placeholder,
  accessibilityLabel,
  disabled,
  onEmptyPress,
  formatSummary,
  renderLabel,
  fieldStyle,
  onClear,
  clearAccessibilityLabel,
}: InlineMultiDropdownProps<T>) {
  const fieldRef = useRef<View>(null);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );

  const panelHeight = Math.min(MAX_PANEL_HEIGHT, options.length * ROW_HEIGHT + 8);
  const opensDown = anchor
    ? anchor.y + anchor.height + GAP_FROM_FIELD + panelHeight <= windowHeight - 12
    : true;

  const summary =
    selected.length === 0
      ? placeholder
      : formatSummary
        ? formatSummary(selected)
        : selected.length <= 2
          ? selected.join(', ')
          : `${selected.slice(0, 2).join(', ')} +${selected.length - 2}`;

  const open = () => {
    if (disabled) {
      return;
    }

    if (options.length === 0) {
      onEmptyPress?.();
      return;
    }

    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  };

  return (
    <View ref={fieldRef} collapsable={false} style={[styles.field, fieldStyle, disabled && styles.fieldDisabled]}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled, expanded: anchor !== null }}
        disabled={disabled}
        onPress={open}
        style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
      >
        <Text
          style={[
            styles.fieldValue,
            selected.length === 0 && styles.placeholder,
            selected.length > 0 && onClear && !disabled && styles.fieldValueClearable,
          ]}
          numberOfLines={1}
        >
          {summary}
        </Text>
        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
      </Pressable>
      {selected.length > 0 && onClear && !disabled ? (
        <FieldClearButton
          accessibilityLabel={clearAccessibilityLabel ?? `Clear ${accessibilityLabel.toLowerCase()}`}
          onPress={() => {
            setAnchor(null);
            onClear();
          }}
          style={styles.clearButton}
        />
      ) : null}

      <Modal animationType="none" transparent visible={anchor !== null} onRequestClose={() => setAnchor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setAnchor(null)}>
          {anchor ? (
            <View
              style={[
                styles.panel,
                {
                  left: Math.max(12, Math.min(anchor.x, windowWidth - anchor.width - 12)),
                  width: anchor.width,
                  maxHeight: panelHeight,
                  ...(opensDown
                    ? { top: anchor.y + anchor.height + GAP_FROM_FIELD }
                    : { top: Math.max(12, anchor.y - GAP_FROM_FIELD - panelHeight) }),
                },
              ]}
            >
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                {options.map((option) => {
                  const checked = selected.includes(option);

                  return (
                    <Pressable
                      key={option}
                      accessibilityLabel={option}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      onPress={() => onToggle(option)}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    >
                      {renderLabel ? (
                        renderLabel(option)
                      ) : (
                        <Text style={[styles.rowText, checked && styles.rowTextSelected]} numberOfLines={1}>
                          {option}
                        </Text>
                      )}
                      {checked ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.surface,
    position: 'relative',
  },
  openButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  fieldDisabled: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  fieldValue: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  fieldValueClearable: {
    paddingRight: 32,
  },
  clearButton: {
    position: 'absolute',
    right: 34,
    top: 8,
    zIndex: 1,
    elevation: 1,
  },
  placeholder: {
    color: tokens.colors.muted,
  },
  backdrop: {
    flex: 1,
    // No dim: a local dropdown should leave the form it belongs to visible.
    backgroundColor: 'transparent',
  },
  panel: {
    position: 'absolute',
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDD5D3',
    paddingVertical: 4,
    shadowColor: '#3B2B28',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    overflow: 'hidden',
  },
  row: {
    minHeight: ROW_HEIGHT,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowPressed: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  rowText: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  rowTextSelected: {
    color: tokens.colors.accentDeep,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.9,
  },
});
