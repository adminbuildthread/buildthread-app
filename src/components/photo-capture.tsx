import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CapturedShot = {
  uri: string;
  base64: string;
};

async function shotFromPicture(uri: string, base64?: string | null): Promise<CapturedShot | null> {
  const inline = base64?.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '');
  if (inline) {
    return { uri, base64: inline };
  }
  try {
    const fromFile = (await new File(uri).base64()).replace(/\s/g, '');
    return fromFile ? { uri, base64: fromFile } : null;
  } catch {
    return null;
  }
}

export function PhotoCapture({
  visible,
  onKeep,
  onClose,
}: {
  visible: boolean;
  onKeep: (shot: CapturedShot) => void;
  onClose: () => void;
}) {
  const cameraRef = useRef<CameraView>(null);
  const onCloseRef = useRef(onClose);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<CapturedShot | null>(null);
  const [taking, setTaking] = useState(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible) {
      setShot(null);
      setReady(false);
      setTaking(false);
      return;
    }
    if (permission?.granted) {
      return;
    }
    let active = true;
    void requestPermission().then((result) => {
      if (!active) {
        return;
      }
      if (!result.granted) {
        Alert.alert('Camera access needed', 'Allow camera access to capture project evidence.');
        onCloseRef.current();
      }
    });
    return () => {
      active = false;
    };
  }, [visible, permission?.granted, requestPermission]);

  const takePhoto = async () => {
    if (!cameraRef.current || !ready || taking) {
      return;
    }
    setTaking(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: true,
        shutterSound: false,
      });
      const nextShot = picture?.uri ? await shotFromPicture(picture.uri, picture.base64) : null;
      if (!nextShot) {
        Alert.alert('Could not take photo', 'Try taking the photo again.');
        return;
      }
      setShot(nextShot);
    } catch {
      Alert.alert('Could not take photo', 'Try taking the photo again.');
    } finally {
      setTaking(false);
    }
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.screen}>
        {shot ? (
          <Image source={{ uri: shot.uri }} style={styles.preview} contentFit="contain" accessibilityLabel="Photo preview" />
        ) : permission?.granted ? (
          <CameraView
            ref={cameraRef}
            style={styles.preview}
            facing="back"
            mode="picture"
            mute
            onCameraReady={() => setReady(true)}
          />
        ) : (
          <View style={styles.preview} />
        )}
        <SafeAreaView edges={['bottom']} style={styles.dock}>
          {shot ? (
            <View style={styles.choice}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setReady(false);
                  setShot(null);
                }}
                style={styles.choiceButton}>
                <Text style={styles.choiceLabel}>Retake</Text>
              </Pressable>
              <View style={styles.choiceDivider} />
              <Pressable accessibilityRole="button" onPress={() => onKeep(shot)} style={styles.choiceButton}>
                <Text style={styles.keepLabel}>Keep</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.captureRow}>
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancelButton}>
                <Text style={styles.choiceLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                disabled={!ready || taking}
                onPress={() => void takePhoto()}
                style={[styles.shutter, (!ready || taking) && styles.shutterDisabled]}>
                {taking ? <ActivityIndicator color="#11181C" /> : <View style={styles.shutterInner} />}
              </Pressable>
              <View style={styles.cancelButton} />
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  preview: {
    flex: 1,
  },
  dock: {
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
  },
  choiceButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#3A3A3C',
  },
  choiceLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  keepLabel: {
    color: '#208AEF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelButton: {
    width: 88,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.45,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
  },
});
