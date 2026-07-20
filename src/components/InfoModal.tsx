import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { AppIcon } from './AppIcon';
import { AnimatedPopupCard } from './AnimatedPopupCard';
import { BouncyPressable } from './BouncyPressable';
import { tokens } from '../theme/tokens';

type InfoModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
};

export function InfoModal({ visible, onClose, title, description }: InfoModalProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <AnimatedPopupCard visible={visible} style={styles.card} onPress={() => undefined}>
          <BouncyPressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.closeButton}
          >
            <AppIcon name="close" size={18} color="#000" />
          </BouncyPressable>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </AnimatedPopupCard>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 2,
    color: tokens.colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  description: {
    marginTop: 10,
    color: tokens.colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
});
