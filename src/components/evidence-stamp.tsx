import { Image } from 'expo-image';
import { useEffect, useRef, useState, type Component } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export function EvidenceStamp({
  uri,
  lines,
  onStamped,
  onError,
}: {
  uri: string;
  lines: string[];
  onStamped: (stampedUri: string) => void;
  onError: (message: string) => void;
}) {
  const viewRef = useRef<Component | null>(null);
  const started = useRef(false);
  const onStampedRef = useRef(onStamped);
  const onErrorRef = useRef(onError);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    onStampedRef.current = onStamped;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!loaded || started.current) {
      return;
    }
    started.current = true;
    const timer = setTimeout(() => {
      const view = viewRef.current;
      if (!view) {
        onErrorRef.current('Could not stamp this photo.');
        return;
      }
      captureRef(view, { format: 'jpg', quality: 0.92, result: 'tmpfile' })
        .then((stampedUri) => {
          onStampedRef.current(stampedUri);
        })
        .catch(() => {
          onErrorRef.current('Could not stamp this photo.');
        });
    }, 80);
    return () => clearTimeout(timer);
  }, [loaded]);

  return (
    <View style={styles.screen}>
      <View ref={viewRef as never} collapsable={false} style={styles.sheet}>
        <Image
          source={{ uri }}
          style={styles.photo}
          contentFit="cover"
          onLoad={() => setLoaded(true)}
          onError={() => onError('Could not prepare the photo for stamping.')}
        />
        <View style={styles.caption}>
          {lines.map((line) => (
            <Text key={line} style={styles.line}>
              {line}
            </Text>
          ))}
        </View>
      </View>
      <ActivityIndicator color="#FFFFFF" style={styles.spinner} />
      <Text style={styles.status}>Adding the evidence stamp</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#111111',
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#1C1C1E',
  },
  caption: {
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  line: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  spinner: {
    marginTop: 16,
  },
  status: {
    color: '#FFFFFF',
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
  },
});
