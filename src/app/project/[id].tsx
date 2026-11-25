import { requireOptionalNativeModule } from 'expo';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoCapture } from '@/components/photo-capture';
import { StageReminderSheet } from '@/components/stage-reminder-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { decodeBase64, uploadJpeg } from '@/lib/upload-jpeg';
import { buildPendingCompliance, readPendingCompliance, samePendingCompliance } from '@/utils/pendingCompliance';
import { formatReminderWhen } from '@/utils/reminder-format';

type GpsPoint = {
  latitude?: number;
  longitude?: number;
};

type PhotoSlot = {
  downloadUrl: string;
  capturedAt?: string;
  location?: GpsPoint | null;
  note?: string;
  pending?: boolean;
};

type SelectedPhoto = {
  locationId: string;
  locationName: string;
  stage: SlotStage;
  photoData: PhotoSlot;
};

type SlotStage = 'before' | 'during' | 'after';

type ProjectLocation = {
  id: string;
  name: string;
  order: number;
  before: PhotoSlot | null;
  during: PhotoSlot | null;
  after: PhotoSlot | null;
};

const SLOT_STAGES: { key: SlotStage; label: string }[] = [
  { key: 'before', label: 'Before' },
  { key: 'during', label: 'During' },
  { key: 'after', label: 'After' },
];

function formatCapturedAt(value: string | undefined): string {
  if (!value) {
    return 'Time not recorded';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function hasGps(location: PhotoSlot['location']): boolean {
  return typeof location?.latitude === 'number' && typeof location?.longitude === 'number';
}

function readText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return undefined;
}

function sameNames(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

function readStoredLocationNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function readSlot(value: unknown): PhotoSlot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const downloadUrl = readText(record.downloadUrl);
  if (!downloadUrl) {
    return null;
  }
  const location = record.location;
  return {
    downloadUrl,
    capturedAt: readText(record.capturedAt),
    location: location && typeof location === 'object' ? (location as GpsPoint) : null,
    note: readText(record.note),
  };
}

function uploadErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '';
  if (
    code.includes('unauthorized') ||
    code.includes('permission-denied') ||
    /permission denied/i.test(message) ||
    message.includes('403')
  ) {
    return 'Firebase blocked this photo. In Storage rules, allow this signed-in user to read and write files under users/{uid}.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Could not upload this photo.';
}

type ProjectMode = 'compliance' | 'quick';

type ProjectStatus = 'active' | 'completed';

function todayUkDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date());
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const year = parts.find((part) => part.type === 'year')?.value ?? '2026';
  return `${day}/${month}/${year}`;
}

async function readProjectFields(projectId: string): Promise<{
  projectMode: ProjectMode;
  status: ProjectStatus;
  endDate: string;
}> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import('@/lib/firestore'),
    import('@/lib/firebase'),
  ]);
  const data = (await getDoc(doc(getDb(), 'projects', projectId))).data();
  return {
    projectMode: data?.projectMode === 'quick' ? 'quick' : 'compliance',
    status: data?.status === 'completed' ? 'completed' : 'active',
    endDate: typeof data?.endDate === 'string' ? data.endDate : '',
  };
}

async function readProjectMode(projectId: string): Promise<ProjectMode> {
  return (await readProjectFields(projectId)).projectMode;
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function filledCount(location: ProjectLocation): number {
  return [location.before, location.during, location.after].filter((slot) => slot != null).length;
}

function stageLabel(stage: SlotStage): string {
  return SLOT_STAGES.find((item) => item.key === stage)?.label ?? stage;
}

function laterStageLabel(location: ProjectLocation, stage: SlotStage): string | null {
  if (stage === 'before' && (location.during || location.after)) {
    return location.during ? 'During' : 'After';
  }
  if (stage === 'during' && location.after) {
    return 'After';
  }
  return null;
}

function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /network|offline|internet|failed to fetch|could not upload this photo/i.test(message);
}

function slotLocked(stage: SlotStage, location: ProjectLocation, isQuick: boolean): boolean {
  if (isQuick) {
    return false;
  }
  if (stage === 'during') {
    return location.before == null;
  }
  if (stage === 'after') {
    return location.during == null;
  }
  return false;
}

export default function ProjectDetailsScreen() {
  const theme = useTheme();
  const { id: idParam, name: nameParam } = useLocalSearchParams<{ id: string; name?: string }>();
  const id = firstParam(idParam);
  const name = firstParam(nameParam);
  const isNewProject = id === 'new';
  const title = isNewProject ? 'Start New Project' : name || 'Project';
  const scrollRef = useRef<{ scrollTo: (options: { y: number; animated?: boolean }) => void } | null>(null);
  const listOffsetRef = useRef(0);
  const pendingFocusId = useRef<string | null>(null);
  const [latestAddedId, setLatestAddedId] = useState<string | null>(null);
  const [locations, setLocations] = useState<ProjectLocation[]>([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [projectMode, setProjectMode] = useState<ProjectMode | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('active');
  const [endDate, setEndDate] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ locationId: string; stage: SlotStage } | null>(null);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [queuedPhotos, setQueuedPhotos] = useState<
    {
      id: string;
      locationId: string;
      stage: SlotStage;
      localUri: string;
      capturedAt: string;
      location: { latitude: number; longitude: number } | null;
      note?: string;
    }[]
  >([]);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(null);
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [interimNote, setInterimNote] = useState('');
  const [isDictating, setIsDictating] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [stageReminders, setStageReminders] = useState<
    { locationId: string; stage: 'during' | 'after'; triggerAt: number }[]
  >([]);
  const [reminderTarget, setReminderTarget] = useState<{
    locationId: string;
    locationName: string;
    stage: 'during' | 'after';
  } | null>(null);
  const pendingSyncVersion = useRef(0);
  const dictatedBaseRef = useRef('');
  const interimNoteRef = useRef('');
  const dictationListeners = useRef<{ remove: () => void }[]>([]);
  const { height: windowHeight } = useWindowDimensions();
  const isQuick = projectMode === 'quick';

  useEffect(() => {
    if (!id || isNewProject) {
      setQueuedPhotos([]);
      return;
    }
    let unsubscribeQueue = () => {};
    let unsubscribeSync = () => {};
    let active = true;
    void import('@/utils/offlineQueue').then(({ subscribeOfflineQueue, subscribeSyncState }) => {
      if (!active) {
        return;
      }
      unsubscribeQueue = subscribeOfflineQueue((items) => {
        setQueuedPhotos(items.filter((item) => item.projectId === id));
      });
      unsubscribeSync = subscribeSyncState(setIsSyncingQueue);
    });
    return () => {
      active = false;
      unsubscribeQueue();
      unsubscribeSync();
    };
  }, [id, isNewProject]);

  useEffect(() => {
    if (!id || isNewProject) {
      setStageReminders([]);
      return;
    }
    let unsubscribe = () => {};
    let active = true;
    void import('@/utils/reminders').then(({ subscribeReminders }) => {
      if (!active) {
        return;
      }
      unsubscribe = subscribeReminders((items) => {
        const now = Date.now();
        setStageReminders(
          items
            .filter((item) => item.projectId === id && item.triggerAt > now)
            .map((item) => ({ locationId: item.locationId, stage: item.stage, triggerAt: item.triggerAt })),
        );
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [id, isNewProject]);

  const displayLocation = (location: ProjectLocation): ProjectLocation => {
    const slot = (stage: SlotStage): PhotoSlot | null => {
      const pending = queuedPhotos.find((item) => item.locationId === location.id && item.stage === stage);
      if (!pending) {
        return location[stage];
      }
      return {
        downloadUrl: pending.localUri,
        capturedAt: pending.capturedAt,
        location: pending.location,
        note: pending.note,
        pending: true,
      };
    };
    return {
      ...location,
      before: slot('before'),
      during: slot('during'),
      after: slot('after'),
    };
  };

  useEffect(() => {
    if (!id || isNewProject) {
      setLocations([]);
      setLocationsLoaded(false);
      setLocationsError(null);
      return;
    }

    let unsubscribe = () => {};
    let active = true;
    let syncedNames: string[] | null = null;
    let syncVersion = 0;

    Promise.all([import('@/lib/firestore'), import('@/lib/firebase')])
      .then(([{ collection, doc, getDoc, onSnapshot, orderBy, query, updateDoc }, { getDb }]) => {
        if (!active) {
          return;
        }

        unsubscribe = onSnapshot(
          query(collection(getDb(), 'projects', id, 'locations'), orderBy('order', 'asc')),
          (snapshot) => {
            setLocationsError(null);
            setLocationsLoaded(true);
            const nextLocations = snapshot.docs.map((locationDoc) => {
              const data = locationDoc.data();
              return {
                id: locationDoc.id,
                name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Location',
                order: typeof data.order === 'number' ? data.order : 0,
                before: readSlot(data.before),
                during: readSlot(data.during),
                after: readSlot(data.after),
              };
            });
            setLocations(nextLocations);
            const names = nextLocations.map((location) => location.name);
            if (syncedNames && sameNames(syncedNames, names)) {
              return;
            }
            const version = ++syncVersion;
            void (async () => {
              try {
                const projectRef = doc(getDb(), 'projects', id);
                const stored = readStoredLocationNames((await getDoc(projectRef)).get('locationNames'));
                if (!active || version !== syncVersion) {
                  return;
                }
                if (sameNames(stored, names)) {
                  syncedNames = names;
                  return;
                }
                await updateDoc(projectRef, { locationNames: names });
                if (active && version === syncVersion) {
                  syncedNames = names;
                }
              } catch {
                // Older projects pick this up the next time their locations load.
              }
            })();
          },
          (error) => {
            setLocationsError(error.message);
          },
        );
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setLocationsError(error instanceof Error ? error.message : 'Could not load locations.');
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [id, isNewProject]);

  useEffect(() => {
    if (!id || isNewProject) {
      setProjectMode(null);
      return;
    }

    let active = true;
    readProjectFields(id)
      .then((fields) => {
        if (active) {
          setProjectMode(fields.projectMode);
          setProjectStatus(fields.status);
          setEndDate(fields.endDate);
        }
      })
      .catch(() => {
        if (active) {
          setProjectMode('compliance');
          setProjectStatus('active');
        }
      });

    return () => {
      active = false;
    };
  }, [id, isNewProject]);

  useEffect(() => {
    if (!id || isNewProject || projectMode == null || !locationsLoaded) {
      return;
    }
    const next = projectMode === 'compliance' ? buildPendingCompliance(locations.map(displayLocation)) : [];
    const version = ++pendingSyncVersion.current;
    let active = true;
    void (async () => {
      try {
        const [{ doc, getDoc, updateDoc }, { getDb }] = await Promise.all([
          import('@/lib/firestore'),
          import('@/lib/firebase'),
        ]);
        const projectRef = doc(getDb(), 'projects', id);
        const stored = readPendingCompliance((await getDoc(projectRef)).get('pendingCompliance'));
        if (!active || version !== pendingSyncVersion.current) {
          return;
        }
        if (samePendingCompliance(stored, next)) {
          return;
        }
        await updateDoc(projectRef, { pendingCompliance: next });
      } catch {
        // The next location or queue change will try again.
      }
    })();
    return () => {
      active = false;
    };
  }, [id, isNewProject, locations, locationsLoaded, projectMode, queuedPhotos]);

  const addLocation = async () => {
    if (!id || isNewProject || isAddingLocation) {
      return;
    }
    setIsAddingLocation(true);
    try {
      const [{ addDoc, collection, serverTimestamp }, { getDb }] = await Promise.all([
        import('@/lib/firestore'),
        import('@/lib/firebase'),
      ]);
      const nextOrder = locations.reduce((max, location) => Math.max(max, location.order), 0) + 1;
      const created = await addDoc(collection(getDb(), 'projects', id, 'locations'), {
        name: `Location ${locations.length + 1}`,
        order: nextOrder,
        createdAt: serverTimestamp(),
        before: null,
        during: null,
        after: null,
      });
      pendingFocusId.current = created.id;
      setLatestAddedId(created.id);
    } catch (error) {
      Alert.alert('Could not add location', uploadErrorMessage(error));
    } finally {
      setIsAddingLocation(false);
    }
  };

  const renameLocation = async (locationId: string, nextName: string) => {
    const trimmed = nextName.trim();
    const current = locations.find((location) => location.id === locationId);
    if (!trimmed || !current || trimmed === current.name) {
      return;
    }
    try {
      const [{ doc, updateDoc }, { getDb }] = await Promise.all([
        import('@/lib/firestore'),
        import('@/lib/firebase'),
      ]);
      await updateDoc(doc(getDb(), 'projects', id, 'locations', locationId), { name: trimmed });
    } catch (error) {
      Alert.alert('Could not rename location', uploadErrorMessage(error));
    }
  };

  const choosePhotoSource = (locationId: string, stage: SlotStage) => {
    if (uploadingSlot) {
      return;
    }
    Alert.alert('Add photo', 'Choose how to add this photo.', [
      { text: 'Take Photo', onPress: () => openCamera(locationId, stage) },
      { text: 'Upload Gallery', onPress: () => void captureSlot(locationId, stage, 'gallery') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openCamera = (locationId: string, stage: SlotStage) => {
    if (!id || isNewProject || uploadingSlot) {
      return;
    }
    if (Platform.OS === 'web') {
      void captureSlot(locationId, stage, 'camera');
      return;
    }
    setCameraTarget({ locationId, stage });
  };

  const captureSlot = async (locationId: string, stage: SlotStage, source: 'camera' | 'gallery') => {
    if (!id || isNewProject || uploadingSlot) {
      return;
    }

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera access needed', 'Allow camera access to capture project evidence.');
        return;
      }
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo library access to add project evidence.');
        return;
      }
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });

    const asset = result.canceled ? null : result.assets[0];
    const imageBase64 = asset?.base64;
    const imageUri = asset?.uri;
    if (!imageBase64 || !imageUri) {
      return;
    }
    await saveCapturedPhoto(locationId, stage, imageBase64, imageUri);
  };

  const saveCapturedPhoto = async (locationId: string, stage: SlotStage, imageBase64: string, imageUri: string) => {
    if (!id || isNewProject || uploadingSlot) {
      return;
    }

    const slotKey = `${locationId}:${stage}`;
    const clearStageReminder = () => {
      if (stage !== 'during' && stage !== 'after') {
        return;
      }
      void import('@/utils/reminders').then(({ cancelStageReminder }) => cancelStageReminder(id, locationId, stage));
    };
    setUploadingSlot(slotKey);
    try {
      const mode = projectMode ?? (await readProjectMode(id));
      if (projectMode == null) {
        setProjectMode(mode);
      }

      let photoLocation: { latitude: number; longitude: number } | null = null;
      const NetInfo = await import('@react-native-community/netinfo');
      const connection = await NetInfo.fetch();
      const offline = !connection.isConnected || connection.isInternetReachable === false;
      if (mode !== 'quick') {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Location needed', 'Allow location access so this evidence can be tagged.');
          return;
        }

        try {
          const position = await Location.getCurrentPositionAsync({});
          photoLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
        } catch (error) {
          if (!offline) {
            throw error;
          }
        }
      }

      const capturedAt = new Date().toISOString();
      const bytes = decodeBase64(imageBase64);
      if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
        throw new Error('The selected photo could not be read as an image.');
      }
      const existingNote = locations.find((item) => item.id === locationId)?.[stage]?.note?.trim() ?? '';
      const draftNote =
        selectedPhoto?.locationId === locationId && selectedPhoto.stage === stage ? noteText.trim() : '';
      const note = draftNote || existingNote;
      const saveOffline = async () => {
        const [{ enqueuePhoto }, { requireUserId }] = await Promise.all([
          import('@/utils/offlineQueue'),
          import('@/lib/firebase-auth'),
        ]);
        await enqueuePhoto({
          id: `${Date.now()}-${locationId}-${stage}`,
          userId: requireUserId(),
          projectId: id,
          locationId,
          stage,
          localUri: imageUri,
          capturedAt,
          location: photoLocation,
          ...(note ? { note } : {}),
        });
        Alert.alert('Saved offline', 'Saved offline — will sync automatically when online.');
        clearStageReminder();
      };
      if (offline) {
        await saveOffline();
        return;
      }
      try {
        const [{ getDb }, { ref, getDownloadURL, getProjectStorage }, firestoreApi, { requireIdToken, requireUserId }] =
          await Promise.all([
            import('@/lib/firebase'),
            import('@/lib/firebase-storage'),
            import('@/lib/firestore'),
            import('@/lib/firebase-auth'),
          ]);
        const objectPath = `users/${requireUserId()}/projects/${id}/evidence/evidence_${Date.now()}.jpeg`;
        const storageRef = ref(getProjectStorage(), objectPath);
        await uploadJpeg(storageRef.bucket, objectPath, bytes, await requireIdToken());
        const downloadUrl = await getDownloadURL(storageRef);
        const slotPhoto: PhotoSlot = {
          downloadUrl,
          capturedAt,
          location: photoLocation,
          ...(note ? { note } : {}),
        };
        await firestoreApi.updateDoc(firestoreApi.doc(getDb(), 'projects', id, 'locations', locationId), {
          [stage]: slotPhoto,
        });
        clearStageReminder();
        setSelectedPhoto((current) => {
          if (!current || current.locationId !== locationId || current.stage !== stage) {
            return current;
          }
          return { ...current, photoData: slotPhoto };
        });
      } catch (error) {
        if (!isNetworkError(error)) {
          throw error;
        }
        await saveOffline();
      }
    } catch (error) {
      Alert.alert('Upload failed', uploadErrorMessage(error));
    } finally {
      setUploadingSlot(null);
    }
  };

  const clearDictationListeners = () => {
    dictationListeners.current.forEach((listener) => listener.remove());
    dictationListeners.current = [];
  };

  const stopDictation = async (commitInterim = true) => {
    clearDictationListeners();
    setIsDictating(false);
    const spoken = interimNoteRef.current.trim();
    interimNoteRef.current = '';
    setInterimNote('');
    if (commitInterim && spoken) {
      const next = [dictatedBaseRef.current.trim(), spoken].filter(Boolean).join(' ');
      dictatedBaseRef.current = next;
      setNoteText(next);
    }
    if (Platform.OS === 'web' || requireOptionalNativeModule('ExpoSpeechRecognition') == null) {
      return;
    }
    try {
      const { ExpoSpeechRecognitionModule } = await import('expo-speech-recognition');
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Recognition was not running.
    }
  };

  const startDictation = async () => {
    if (isDictating) {
      await stopDictation();
      return;
    }
    if (Platform.OS !== 'web' && requireOptionalNativeModule('ExpoSpeechRecognition') == null) {
      Alert.alert(
        'Dictation is unavailable',
        'Talk to text needs an installed BuildThread build. It is not available in Expo Go.',
      );
      return;
    }
    try {
      const { ExpoSpeechRecognitionModule } = await import('expo-speech-recognition');
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone access needed', 'Allow the microphone and speech recognition to dictate a note.');
        return;
      }
      dictatedBaseRef.current = noteText.trim();
      interimNoteRef.current = '';
      setInterimNote('');
      clearDictationListeners();
      dictationListeners.current = [
        ExpoSpeechRecognitionModule.addListener('start', () => setIsDictating(true)),
        ExpoSpeechRecognitionModule.addListener('end', () => setIsDictating(false)),
        ExpoSpeechRecognitionModule.addListener('result', (event) => {
          const transcript = event.results[0]?.transcript?.trim() ?? '';
          if (!transcript) {
            return;
          }
          if (event.isFinal) {
            const next = [dictatedBaseRef.current.trim(), transcript].filter(Boolean).join(' ');
            dictatedBaseRef.current = next;
            interimNoteRef.current = '';
            setInterimNote('');
            setNoteText(next);
            return;
          }
          interimNoteRef.current = transcript;
          setInterimNote(transcript);
        }),
        ExpoSpeechRecognitionModule.addListener('error', (event) => {
          setIsDictating(false);
          interimNoteRef.current = '';
          setInterimNote('');
          if (event.error === 'aborted' || event.error === 'no-speech') {
            return;
          }
          Alert.alert('Could not dictate the note', event.message || 'Try again.');
        }),
      ];
      ExpoSpeechRecognitionModule.start({
        lang: 'en-GB',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        iosTaskHint: 'dictation',
      });
    } catch {
      clearDictationListeners();
      setIsDictating(false);
      Alert.alert(
        'Dictation is unavailable',
        'Talk to text needs an installed BuildThread build. It is not available in Expo Go.',
      );
    }
  };

  const openPhoto = (location: ProjectLocation, stage: SlotStage) => {
    const photo = location[stage];
    if (!photo) {
      return;
    }
    setSelectedPhoto({
      locationId: location.id,
      locationName: location.name,
      stage,
      photoData: photo,
    });
    setNoteText(photo.note ?? '');
    dictatedBaseRef.current = photo.note ?? '';
    interimNoteRef.current = '';
    setInterimNote('');
    void stopDictation(false);
  };

  const closePhoto = () => {
    void stopDictation(false);
    setPhotoExpanded(false);
    setSelectedPhoto(null);
    setNoteText('');
  };

  const saveNote = async () => {
    if (!selectedPhoto || !id || isSavingNote) {
      return;
    }
    setIsSavingNote(true);
    try {
      await stopDictation();
      const [{ doc, updateDoc }, { getDb }] = await Promise.all([
        import('@/lib/firestore'),
        import('@/lib/firebase'),
      ]);
      const note = dictatedBaseRef.current.trim();
      await updateDoc(doc(getDb(), 'projects', id, 'locations', selectedPhoto.locationId), {
        [`${selectedPhoto.stage}.note`]: note,
      });
      setSelectedPhoto((current) =>
        current
          ? { ...current, photoData: { ...current.photoData, note: note || undefined } }
          : current,
      );
    } catch (error) {
      Alert.alert('Could not save note', uploadErrorMessage(error));
    } finally {
      setIsSavingNote(false);
    }
  };

  const deleteLocation = (locationId: string, locationName: string) => {
    if (!id || isNewProject) {
      return;
    }
    if (uploadingSlot?.startsWith(`${locationId}:`)) {
      Alert.alert('Photo still saving', 'Wait for the photo to finish before deleting this location.');
      return;
    }
    Alert.alert('Delete location?', `Remove ${locationName} and its photos?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void confirmDeleteLocation(locationId) },
    ]);
  };

  const confirmDeleteLocation = async (locationId: string) => {
    if (!id) {
      return;
    }
    try {
      const [{ deleteDoc, doc }, { getDb }] = await Promise.all([
        import('@/lib/firestore'),
        import('@/lib/firebase'),
      ]);
      await deleteDoc(doc(getDb(), 'projects', id, 'locations', locationId));
      if (selectedPhoto?.locationId === locationId) {
        closePhoto();
      }
      const projectId = id;
      void import('@/utils/reminders').then(({ cancelStageReminder }) =>
        Promise.all([
          cancelStageReminder(projectId, locationId, 'during'),
          cancelStageReminder(projectId, locationId, 'after'),
        ]),
      );
      void import('@/utils/offlineQueue').then(async ({ getQueuedPhotos, removeQueuedPhoto }) => {
        const queued = await getQueuedPhotos(projectId);
        await Promise.all(queued.filter((item) => item.locationId === locationId).map((item) => removeQueuedPhoto(item.id)));
      });
    } catch (error) {
      Alert.alert('Could not delete location', uploadErrorMessage(error));
    }
  };

  const deletePhoto = () => {
    if (!selectedPhoto) {
      return;
    }
    const location = locations.find((item) => item.id === selectedPhoto.locationId);
    const laterStage = location && projectMode === 'compliance' ? laterStageLabel(location, selectedPhoto.stage) : null;
    if (laterStage) {
      Alert.alert(
        'Delete the later photo first',
        `${laterStage} still has a photo. Delete that photo first, or use Retake to replace this one.`,
      );
      return;
    }
    Alert.alert('Delete photo', 'Remove this photo from the location?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void confirmDeletePhoto() },
    ]);
  };

  const confirmDeletePhoto = async () => {
    if (!selectedPhoto || !id) {
      return;
    }
    const { locationId, stage } = selectedPhoto;
    try {
      const [{ doc, updateDoc }, { getDb }] = await Promise.all([
        import('@/lib/firestore'),
        import('@/lib/firebase'),
      ]);
      await updateDoc(doc(getDb(), 'projects', id, 'locations', locationId), { [stage]: null });
      closePhoto();
    } catch (error) {
      Alert.alert('Could not delete photo', uploadErrorMessage(error));
    }
  };

  const exportReport = async () => {
    if (!id || isNewProject || isExporting) {
      return;
    }
    setIsExporting(true);
    try {
      const { exportProjectReport } = await import('@/utils/pdfReport');
      await exportProjectReport({ id, name });
    } catch (error) {
      Alert.alert(
        'Could not export report',
        error instanceof Error && error.message ? error.message : 'Could not create the PDF report.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  const confirmComplete = async () => {
    if (!id || isNewProject || isUpdatingStatus) {
      return;
    }
    setIsUpdatingStatus(true);
    try {
      const [{ doc, serverTimestamp, updateDoc }, { getDb }] = await Promise.all([
        import('@/lib/firestore'),
        import('@/lib/firebase'),
      ]);
      const nextEndDate = endDate.trim() ? undefined : todayUkDate();
      await updateDoc(doc(getDb(), 'projects', id), {
        status: 'completed',
        completedAt: serverTimestamp(),
        ...(nextEndDate ? { endDate: nextEndDate } : {}),
      });
      if (nextEndDate) {
        setEndDate(nextEndDate);
      }
      setProjectStatus('completed');
    } catch (error) {
      Alert.alert(
        'Could not complete project',
        error instanceof Error && error.message ? error.message : 'Could not update this project.',
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const markComplete = async () => {
    if (!id || isNewProject || isUpdatingStatus) {
      return;
    }
    const mode = projectMode ?? (await readProjectMode(id));
    const missingEvidence =
      mode === 'compliance' &&
      locations.some((location) => {
        const shown = displayLocation(location);
        return !shown.before || !shown.during || !shown.after;
      });
    if (missingEvidence) {
      Alert.alert(
        'Some compliance photos are missing',
        'A location is still missing a Before, During, or After photo.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Complete Anyway', onPress: () => void confirmComplete() },
        ],
      );
      return;
    }
    Alert.alert('Mark this job as complete?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => void confirmComplete() },
    ]);
  };

  const reopenProject = async () => {
    if (!id || isNewProject || isUpdatingStatus) {
      return;
    }
    setIsUpdatingStatus(true);
    try {
      const [{ doc, updateDoc }, { getDb }] = await Promise.all([
        import('@/lib/firestore'),
        import('@/lib/firebase'),
      ]);
      await updateDoc(doc(getDb(), 'projects', id), { status: 'active' });
      setProjectStatus('active');
    } catch (error) {
      Alert.alert(
        'Could not reopen project',
        error instanceof Error && error.message ? error.message : 'Could not update this project.',
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title, headerShadowVisible: false }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          ref={(node) => {
            scrollRef.current = node;
          }}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.body}>
            <View style={styles.metaRow}>
              <ThemedText type="small" themeColor="textSecondary">
                {isNewProject ? 'New project' : isQuick ? 'Quick Log' : 'Compliance Job'}
              </ThemedText>
              {isNewProject ? null : (
                <View style={[styles.statusPill, projectStatus === 'completed' ? styles.statusPillComplete : styles.statusPillActive]}>
                  <Text style={styles.statusPillLabel}>{projectStatus === 'completed' ? 'Completed' : 'Active'}</Text>
                </View>
              )}
            </View>
            <ThemedText style={styles.title}>{title}</ThemedText>
            {queuedPhotos.length > 0 ? (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerLabel}>
                  {queuedPhotos.length === 1 ? '1 photo waiting to sync' : `${queuedPhotos.length} photos waiting to sync`}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isSyncingQueue }}
                  disabled={isSyncingQueue}
                  onPress={() =>
                    void import('@/utils/offlineQueue').then(({ syncOfflineQueue }) => syncOfflineQueue({ force: true }))
                  }
                  style={styles.offlineSync}>
                  {isSyncingQueue ? <ActivityIndicator color="#B54708" /> : <Text style={styles.offlineSyncLabel}>Sync Now</Text>}
                </Pressable>
              </View>
            ) : null}
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isNewProject || isExporting }}
                disabled={isNewProject || isExporting}
                onPress={() => void exportReport()}
                style={[styles.exportButton, { borderColor: theme.backgroundSelected }, (isNewProject || isExporting) && styles.buttonDisabled]}>
                {isExporting ? <ActivityIndicator color={theme.text} /> : null}
                <Text style={[styles.exportLabel, { color: theme.text }]}>{isExporting ? 'Exporting' : 'Export PDF'}</Text>
              </Pressable>
              {isNewProject ? null : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isUpdatingStatus }}
                  disabled={isUpdatingStatus}
                  onPress={() => void (projectStatus === 'completed' ? reopenProject() : markComplete())}
                  style={[
                    styles.statusButton,
                    projectStatus === 'completed' ? styles.reopenButton : styles.completeButton,
                    isUpdatingStatus && styles.buttonDisabled,
                  ]}>
                  {isUpdatingStatus ? <ActivityIndicator color={projectStatus === 'completed' ? theme.text : '#FFFFFF'} /> : null}
                  <Text style={[styles.statusButtonLabel, projectStatus === 'completed' && { color: theme.text }]}>
                    {isUpdatingStatus ? 'Saving' : projectStatus === 'completed' ? 'Reopen Project' : 'Mark Complete'}
                  </Text>
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isNewProject || isAddingLocation }}
              disabled={isNewProject || isAddingLocation}
              onPress={addLocation}
              style={[styles.addButton, (isNewProject || isAddingLocation) && styles.buttonDisabled]}>
              {isAddingLocation ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.addIcon}>+</Text>}
              <Text style={styles.addLabel}>{isAddingLocation ? 'Adding' : 'Add Location'}</Text>
            </Pressable>
            {locationsError ? <Text style={styles.errorText}>{locationsError}</Text> : null}
            {locations.length === 0 && !locationsError ? (
              <ThemedText type="small" themeColor="textSecondary">
                {isNewProject
                  ? 'Open a saved project before adding locations.'
                  : 'Add a location, then capture Before, During, and After.'}
              </ThemedText>
            ) : null}
          </View>

          <View
            style={styles.list}
            onLayout={(event) => {
              listOffsetRef.current = event.nativeEvent.layout.y;
            }}>
            {locations.map((location) => {
              const shown = displayLocation(location);
              return (
              <Fragment key={location.id}>
              <View
                onLayout={(event) => {
                  if (pendingFocusId.current !== location.id) {
                    return;
                  }
                  const y = listOffsetRef.current + event.nativeEvent.layout.y;
                  pendingFocusId.current = null;
                  requestAnimationFrame(() => {
                    scrollRef.current?.scrollTo({ y: Math.max(0, y - Spacing.two), animated: true });
                  });
                }}>
              <LocationCard
                location={shown}
                isQuick={isQuick}
                uploadingStage={
                  uploadingSlot?.startsWith(`${location.id}:`)
                    ? (uploadingSlot.slice(location.id.length + 1) as SlotStage)
                    : null
                }
                onRename={(nextName) => renameLocation(location.id, nextName)}
                onDelete={() => deleteLocation(location.id, shown.name)}
                onCapture={(stage) => choosePhotoSource(location.id, stage)}
                onOpen={(stage) => openPhoto(shown, stage)}
                onReminder={(stage) =>
                  setReminderTarget({ locationId: location.id, locationName: shown.name, stage })
                }
                reminderLabel={(stage) => {
                  const reminder = stageReminders.find(
                    (item) => item.locationId === location.id && item.stage === stage,
                  );
                  return reminder ? formatReminderWhen(reminder.triggerAt) : null;
                }}
              />
              </View>
              {location.id === latestAddedId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add another location"
                  accessibilityState={{ disabled: isAddingLocation }}
                  disabled={isAddingLocation}
                  onPress={addLocation}
                  style={styles.addAnother}>
                  {isAddingLocation ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.addAnotherIcon}>+</Text>}
                </Pressable>
              ) : null}
              </Fragment>
              );
            })}
          </View>
        </ScrollView>
        {cameraTarget ? (
          <PhotoCapture
            visible
            onClose={() => setCameraTarget(null)}
            onKeep={(shot) => {
              const target = cameraTarget;
              setCameraTarget(null);
              void saveCapturedPhoto(target.locationId, target.stage, shot.base64, shot.uri);
            }}
          />
        ) : null}
        <StageReminderSheet
          visible={reminderTarget != null}
          stageLabel={reminderTarget ? stageLabel(reminderTarget.stage) : ''}
          locationName={reminderTarget?.locationName ?? ''}
          scheduledLabel={
            reminderTarget
              ? (() => {
                  const reminder = stageReminders.find(
                    (item) => item.locationId === reminderTarget.locationId && item.stage === reminderTarget.stage,
                  );
                  return reminder ? formatReminderWhen(reminder.triggerAt) : null;
                })()
              : null
          }
          onClose={() => setReminderTarget(null)}
          onPick={(date) => {
            if (!reminderTarget || !id) {
              return;
            }
            const target = reminderTarget;
            void import('@/utils/reminders')
              .then(({ scheduleStageReminder }) =>
                scheduleStageReminder({
                  projectId: id,
                  projectName: name || 'Project',
                  locationId: target.locationId,
                  locationName: target.locationName,
                  stage: target.stage,
                  triggerDate: date,
                }),
              )
              .then(() => setReminderTarget(null))
              .catch((error: unknown) => {
                Alert.alert(
                  'Could not set reminder',
                  error instanceof Error && error.message ? error.message : 'Try again.',
                );
              });
          }}
          onCancelReminder={() => {
            if (!reminderTarget || !id) {
              return;
            }
            const target = reminderTarget;
            void import('@/utils/reminders')
              .then(({ cancelStageReminder }) => cancelStageReminder(id, target.locationId, target.stage))
              .then(() => setReminderTarget(null))
              .catch((error: unknown) => {
                Alert.alert(
                  'Could not cancel reminder',
                  error instanceof Error && error.message ? error.message : 'Try again.',
                );
              });
          }}
        />
        <Modal animationType="slide" visible={!!selectedPhoto} onRequestClose={closePhoto}>
          <KeyboardAvoidingView
            style={styles.viewer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <SafeAreaView style={styles.viewerSafe} edges={['top', 'bottom']}>
              {selectedPhoto ? (
                <>
                  <View style={styles.viewerHeader}>
                    <Text style={styles.viewerHeading}>
                      {selectedPhoto.locationName} • {stageLabel(selectedPhoto.stage)}
                    </Text>
                    <Pressable accessibilityRole="button" onPress={closePhoto} style={styles.viewerClose}>
                      <Text style={styles.viewerCloseLabel}>Close</Text>
                    </Pressable>
                  </View>
                  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.viewerContent}>
                    <TouchableOpacity
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`Enlarge ${stageLabel(selectedPhoto.stage)} photo`}
                      activeOpacity={0.9}
                      onPress={() => setPhotoExpanded(true)}>
                      <Image
                        source={{ uri: selectedPhoto.photoData.downloadUrl }}
                        style={[styles.viewerImage, { height: Math.max(windowHeight * 0.42, 240) }]}
                        contentFit="contain"
                        accessibilityLabel={`${stageLabel(selectedPhoto.stage)} photo`}
                      />
                    </TouchableOpacity>
                    <Modal
                      animationType="fade"
                      transparent
                      visible={photoExpanded}
                      onRequestClose={() => setPhotoExpanded(false)}>
                      <View style={styles.zoomBackdrop}>
                        <Pressable
                          accessibilityRole="imagebutton"
                          accessibilityLabel="Close full screen photo"
                          onPress={() => setPhotoExpanded(false)}
                          style={styles.zoomImagePress}>
                          <Image
                            source={{ uri: selectedPhoto.photoData.downloadUrl }}
                            style={styles.zoomImage}
                            contentFit="contain"
                            accessibilityLabel={`${stageLabel(selectedPhoto.stage)} photo full screen`}
                          />
                        </Pressable>
                        <SafeAreaView style={styles.zoomCloseBar} edges={['top']} pointerEvents="box-none">
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setPhotoExpanded(false)}
                            style={styles.viewerClose}>
                            <Text style={styles.viewerCloseLabel}>Close</Text>
                          </Pressable>
                        </SafeAreaView>
                      </View>
                    </Modal>
                    <View style={styles.viewerMeta}>
                      <Text style={styles.viewerMetaText}>{formatCapturedAt(selectedPhoto.photoData.capturedAt)}</Text>
                      {projectMode === 'compliance' && hasGps(selectedPhoto.photoData.location) ? (
                        <Text style={styles.viewerMetaText}>
                          GPS {selectedPhoto.photoData.location?.latitude?.toFixed(5)},{' '}
                          {selectedPhoto.photoData.location?.longitude?.toFixed(5)}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.noteField}>
                      <TextInput
                        value={interimNote ? `${noteText}${noteText ? ' ' : ''}${interimNote}` : noteText}
                        onChangeText={(value) => {
                          if (isDictating) {
                            void stopDictation(false);
                          }
                          dictatedBaseRef.current = value;
                          interimNoteRef.current = '';
                          setInterimNote('');
                          setNoteText(value);
                        }}
                        placeholder="Add a note for the report..."
                        placeholderTextColor="#A1A1AA"
                        multiline
                        style={styles.noteInput}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isDictating ? 'Stop dictating' : 'Dictate note'}
                        onPress={() => void startDictation()}
                        style={[styles.noteMic, isDictating && styles.noteMicListening]}>
                        <Ionicons name={isDictating ? 'stop' : 'mic-outline'} size={18} color="#FFFFFF" />
                      </Pressable>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isSavingNote }}
                      disabled={isSavingNote}
                      onPress={saveNote}
                      style={[styles.viewerButton, isSavingNote && styles.buttonDisabled]}>
                      {isSavingNote ? <ActivityIndicator color="#FFFFFF" /> : null}
                      <Text style={styles.viewerButtonLabel}>{isSavingNote ? 'Saving' : 'Save Note'}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => choosePhotoSource(selectedPhoto.locationId, selectedPhoto.stage)}
                      style={styles.viewerSecondary}>
                      <Text style={styles.viewerSecondaryLabel}>Retake / Replace</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={deletePhoto} style={styles.viewerDanger}>
                      <Text style={styles.viewerDangerLabel}>Delete Photo</Text>
                    </Pressable>
                  </ScrollView>
                </>
              ) : null}
            </SafeAreaView>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

function LocationCard({
  location,
  isQuick,
  uploadingStage,
  onRename,
  onDelete,
  onCapture,
  onOpen,
  onReminder,
  reminderLabel,
}: {
  location: ProjectLocation;
  isQuick: boolean;
  uploadingStage: SlotStage | null;
  onRename: (name: string) => void;
  onDelete: () => void;
  onCapture: (stage: SlotStage) => void;
  onOpen: (stage: SlotStage) => void;
  onReminder: (stage: 'during' | 'after') => void;
  reminderLabel: (stage: 'during' | 'after') => string | null;
}) {
  const theme = useTheme();
  const [name, setName] = useState(location.name);
  const [isFocused, setIsFocused] = useState(false);
  const progress = filledCount(location);

  useEffect(() => {
    if (!isFocused) {
      setName(location.name);
    }
  }, [isFocused, location.name]);

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cardHeader}>
        <TextInput
          value={name}
          onChangeText={setName}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onRename(name);
          }}
          onSubmitEditing={() => onRename(name)}
          returnKeyType="done"
          blurOnSubmit
          style={[styles.cardTitle, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        {isQuick ? null : progress === 3 ? (
          <View style={[styles.progressBadge, styles.progressComplete]}>
            <Text style={[styles.progressLabel, styles.progressCompleteLabel]}>Complete</Text>
          </View>
        ) : (
          <View style={styles.progressBadge}>
            <Text style={styles.progressLabel}>{progress}/3</Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${location.name}`}
          hitSlop={8}
          onPress={onDelete}
          style={styles.deleteLocation}>
          <Ionicons name="trash-outline" size={18} color="#B42318" />
        </Pressable>
      </View>
      <View style={styles.slots}>
        {SLOT_STAGES.map((stage) => {
          const photo = location[stage.key];
          const locked = slotLocked(stage.key, location, isQuick);
          const isUploading = uploadingStage === stage.key;
          return (
            <PhotoSlotView
              key={stage.key}
              label={stage.label}
              photo={photo}
              locked={locked}
              isUploading={isUploading}
              showGps={!isQuick}
              onPress={() => onCapture(stage.key)}
              onOpen={() => onOpen(stage.key)}
            />
          );
        })}
      </View>
      {isQuick
        ? null
        : (['during', 'after'] as const).map((stage) => {
            if (location[stage] || slotLocked(stage, location, false) || uploadingStage === stage) {
              return null;
            }
            const scheduled = reminderLabel(stage);
            return (
              <Pressable
                key={stage}
                accessibilityRole="button"
                accessibilityLabel={scheduled ? `Reminder ${scheduled}` : `Set reminder for ${stageLabel(stage)}`}
                onPress={() => onReminder(stage)}
                style={styles.reminderButton}>
                {scheduled ? null : <Ionicons name="alarm-outline" size={16} color="#B54708" />}
                <Text style={styles.reminderLabel}>{scheduled ? `⏰ ${scheduled}` : 'Set Reminder'}</Text>
              </Pressable>
            );
          })}
    </View>
  );
}

function PhotoSlotView({
  label,
  photo,
  locked,
  isUploading,
  showGps,
  onPress,
  onOpen,
}: {
  label: string;
  photo: PhotoSlot | null;
  locked: boolean;
  isUploading: boolean;
  showGps: boolean;
  onPress: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();

  if (photo && !isUploading) {
    return (
      <TouchableOpacity
        accessibilityRole="imagebutton"
        accessibilityLabel={`View larger ${label} photo`}
        activeOpacity={0.85}
        onPress={onOpen}
        style={styles.slot}>
        <Image
          source={{ uri: photo.downloadUrl }}
          style={styles.thumbnail}
          contentFit="cover"
          accessibilityLabel={`${label} photo`}
        />
        <Text style={[styles.timestamp, { color: theme.text }]} numberOfLines={2}>
          {formatCapturedAt(photo.capturedAt)}
        </Text>
        {photo.note ? (
          <View style={styles.noteRow}>
            <SymbolView
              name={{ ios: 'note.text', android: 'sticky_note_2', web: 'sticky_note_2' }}
              size={12}
              tintColor={theme.textSecondary}
            />
            <Text style={[styles.notePreview, { color: theme.textSecondary }]} numberOfLines={1}>
              {photo.note}
            </Text>
          </View>
        ) : null}
        {photo.pending ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeLabel}>Pending Sync</Text>
          </View>
        ) : null}
        {showGps && hasGps(photo.location) ? (
          <View style={styles.gpsBadge}>
            <Text style={styles.gpsBadgeLabel}>GPS</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: locked || isUploading }}
      disabled={locked || isUploading}
      onPress={onPress}
      style={[
        styles.slot,
        styles.emptySlot,
        { borderColor: theme.textSecondary },
        locked && styles.slotLocked,
      ]}>
      {isUploading ? (
        <ActivityIndicator color="#208AEF" />
      ) : locked ? (
        <SymbolView name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} size={18} tintColor={theme.textSecondary} />
      ) : (
        <View style={styles.emptyIcons}>
          <Text style={styles.plus}>+</Text>
          <SymbolView
            name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }}
            size={16}
            tintColor={theme.textSecondary}
          />
        </View>
      )}
      <Text style={[styles.slotLabel, { color: theme.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.five,
  },
  body: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  statusPillActive: {
    backgroundColor: '#208AEF',
  },
  statusPillComplete: {
    backgroundColor: '#067647',
  },
  statusPillLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  exportButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  statusButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  completeButton: {
    backgroundColor: '#067647',
  },
  reopenButton: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  statusButtonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  exportLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  addButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#208AEF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  addIcon: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '500',
  },
  addLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  addAnother: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAnotherIcon: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '500',
    textAlign: 'center',
    includeFontPadding: false,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    borderRadius: 22,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  deleteLocation: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    borderBottomWidth: 1,
    paddingBottom: 4,
    paddingHorizontal: 0,
  },
  progressBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(32, 138, 239, 0.16)',
  },
  progressComplete: {
    backgroundColor: 'rgba(18, 183, 106, 0.16)',
  },
  progressLabel: {
    color: '#208AEF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  progressCompleteLabel: {
    color: '#067647',
  },
  slots: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  reminderButton: {
    minHeight: 36,
    borderRadius: 12,
    backgroundColor: '#FFFAEB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.two,
  },
  reminderLabel: {
    color: '#B54708',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  slot: {
    flex: 1,
    minHeight: 132,
    gap: 6,
  },
  emptySlot: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.two,
  },
  slotLocked: {
    opacity: 0.45,
  },
  emptyIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  plus: {
    color: '#60646C',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '600',
  },
  slotLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  thumbnail: {
    width: '100%',
    height: 96,
    borderRadius: 14,
  },
  timestamp: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  pendingBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FEF0C7',
  },
  pendingBadgeLabel: {
    color: '#B54708',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFAEB',
  },
  offlineBannerLabel: {
    flex: 1,
    color: '#B54708',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  offlineSync: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  offlineSyncLabel: {
    color: '#B54708',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  gpsBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(32, 138, 239, 0.16)',
  },
  gpsBadgeLabel: {
    color: '#208AEF',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notePreview: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  viewer: {
    flex: 1,
    backgroundColor: '#111111',
  },
  viewerSafe: {
    flex: 1,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  viewerHeading: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  viewerClose: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  viewerCloseLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  viewerContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  viewerImage: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#000000',
  },
  zoomBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  zoomImagePress: {
    flex: 1,
  },
  zoomImage: {
    width: '100%',
    height: '100%',
  },
  zoomCloseBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  viewerMeta: {
    gap: Spacing.one,
  },
  viewerMetaText: {
    color: '#E4E4E7',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  noteField: {
    position: 'relative',
  },
  noteInput: {
    minHeight: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3F3F46',
    backgroundColor: '#18181B',
    color: '#FFFFFF',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingRight: 52,
    paddingBottom: Spacing.three,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  noteMic: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteMicListening: {
    backgroundColor: '#B42318',
  },
  viewerButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#208AEF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  viewerButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  viewerSecondary: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3F3F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerSecondaryLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  viewerDanger: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerDangerLabel: {
    color: '#F97066',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
});
