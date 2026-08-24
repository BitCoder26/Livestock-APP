import ExpoDateTimePicker, {
  type DateTimePickerProps,
} from '@expo/ui/community/datetime-picker';

import { tokens } from '../theme/tokens';

// Android gets Expo UI's modern Material 3 dialog, branded with the same
// coral accent as the rest of LivestockBook. The base module keeps the
// existing community picker on iOS, where it is hosted in our branded sheet.
export default function AppDateTimePicker(props: DateTimePickerProps) {
  return (
    <ExpoDateTimePicker
      {...props}
      accentColor={tokens.colors.accent}
      presentation="dialog"
    />
  );
}
