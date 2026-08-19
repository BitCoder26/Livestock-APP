import { ReactNode, useRef, useState } from 'react';
import { KeyboardTypeOptions, Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';

import { AppIcon, AppIconName } from './AppIcon';
import { tokens } from '../theme/tokens';

type DesignFieldProps = {
  value: string;
  label?: string;
  icon?: AppIconName;
  left?: ReactNode;
  right?: ReactNode;
  large?: boolean;
  /** Hint shown while the field is empty. Falls back to the historic
   *  behaviour of echoing `value`, so existing callers are unaffected. */
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  onChangeText?: (value: string) => void;
  fieldStyle?: StyleProp<ViewStyle>;
  editable?: boolean;
};

export function DesignField({
  value,
  label,
  icon,
  left,
  right,
  large = false,
  placeholder,
  keyboardType,
  onChangeText,
  fieldStyle,
  editable = true,
}: DesignFieldProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={styles.block}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.field,
          fieldStyle,
          large && styles.fieldLarge,
          focused && styles.fieldFocused,
          !editable && styles.fieldDisabled,
        ]}
      >
        <View style={styles.fieldValueWrap}>
          {left ?? (icon ? <AppIcon name={icon} size={17} /> : null)}
          <TextInput
            ref={inputRef}
            defaultValue={onChangeText ? undefined : value}
            placeholder={placeholder ?? value}
            placeholderTextColor="#7a7a7a"
            style={[styles.value, large && styles.valueLarge]}
            multiline={large}
            textAlignVertical={large ? 'top' : 'center'}
            keyboardType={keyboardType}
            cursorColor="#000"
            selectionColor="#000"
            value={onChangeText ? value : undefined}
            onChangeText={onChangeText}
            editable={editable}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </View>
        {right}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 8,
  },
  label: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  field: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldFocused: {
    borderColor: tokens.colors.accent,
  },
  fieldDisabled: {
    backgroundColor: '#F0EEF1',
  },
  fieldLarge: {
    minHeight: 98,
    borderRadius: 22,
    paddingTop: 16,
    paddingBottom: 16,
    alignItems: 'flex-start',
  },
  fieldValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  value: {
    color: '#2b2b2b',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    paddingVertical: 0,
  },
  valueLarge: {
    minHeight: 64,
  },
});
