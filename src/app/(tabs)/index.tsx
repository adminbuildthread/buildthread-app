import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProjects } from '@/hooks/use-projects';
import { formatPhotoAge, formatReminderWhen } from '@/utils/reminder-format';

function ScrollEdgeHint({ isDark, style }: { isDark: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.scrollHint, style]} pointerEvents="none">
      <View
        style={[
          styles.scrollHintFade,
          {
            backgroundImage: `linear-gradient(to right, ${isDark ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)'} 15%, ${isDark ? '#000000' : '#ffffff'} 75%)`,
          },
        ]}
      />
      <View style={styles.scrollHintChevron}>
        <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const isDark = useColorScheme() === 'dark';
  const { projects, source, errorMessage } = useProjects();
  const [projectFilter, setProjectFilter] = useState<'active' | 'completed'>('active');
  const [exportingProjectId, setExportingProjectId] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [syncFailures, setSyncFailures] = useState(0);
  const [now, setNow] = useState(0);
  const [queuedThumbs, setQueuedThumbs] = useState<
    { projectId: string; locationId: string; stage: string; localUri: string }[]
  >([]);
  const [stageReminders, setStageReminders] = useState<
    { projectId: string; locationId: string; stage: string; triggerAt: number }[]
  >([]);
  const [isOnline, setIsOnline] = useState(true);
  const activeProjects = projects.filter((project) => project.status !== 'completed' && project.status !== 'archived');
  const completedProjects = projects.filter((project) => project.status === 'completed' || project.status === 'archived');
  const visibleProjects = projectFilter === 'completed' ? completedProjects : activeProjects;
  const hasVisibleProjects = visibleProjects.length > 0;
  const { width: screenWidth } = useWindowDimensions();
  const emptyCardWidth = Math.min(CARD_WIDTH, Math.max(0, screenWidth - EMPTY_ROW_INSET));
  const projectStride = CARD_WIDTH + Spacing.three;
  const projectCenterInset = Math.max(0, (screenWidth - CARD_WIDTH) / 2);
  const projectSnapOffsets = visibleProjects.map((_, index) => {
    const contentLeft = Spacing.four + CARD_WIDTH + Spacing.two + index * projectStride;
    return Math.max(0, Math.round(contentLeft - projectCenterInset));
  });
  const projectStopOffsets = [0, ...projectSnapOffsets.filter((offset) => offset > 0)];
  const scrollerRef = useRef<{ scrollTo: (options: { x: number; animated?: boolean }) => void } | null>(null);
  const scrollOffsetRef = useRef(0);
  const contentWidthRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const pendingOffsetRef = useRef(0);
  const pendingContentWidthRef = useRef(0);
  const pendingViewportWidthRef = useRef(0);
  const [showPendingScrollHint, setShowPendingScrollHint] = useState(false);
  const syncScrollHint = useCallback((offset: number) => {
    scrollOffsetRef.current = offset;
    const remaining = contentWidthRef.current - viewportWidthRef.current - offset;
    const next = remaining > 24;
    setShowScrollHint((current) => (current === next ? current : next));
  }, []);
  const syncPendingScrollHint = useCallback((offset: number) => {
    pendingOffsetRef.current = offset;
    const remaining = pendingContentWidthRef.current - pendingViewportWidthRef.current - offset;
    const next = remaining > 24;
    setShowPendingScrollHint((current) => (current === next ? current : next));
  }, []);
  const newestProjectId = useRef<string | undefined>(undefined);
  const [scrollX] = useState(() => new Animated.Value(0));

  const resetProjectScroll = useCallback(() => {
    scrollX.setValue(0);
    scrollerRef.current?.scrollTo({ x: 0, animated: false });
    syncScrollHint(0);
  }, [scrollX, syncScrollHint]);

  useFocusEffect(
    useCallback(() => {
      resetProjectScroll();
      const frame = requestAnimationFrame(resetProjectScroll);
      return () => cancelAnimationFrame(frame);
    }, [resetProjectScroll]),
  );

  useEffect(() => {
    let active = true;
    const apply = (online: boolean) => {
      if (active) {
        setIsOnline(online);
      }
    };
    const readConnection = async () => {
      try {
        const state = await NetInfo.fetch();
        if (state.isConnected === false || state.type === 'none' || state.isInternetReachable === false) {
          apply(false);
          return;
        }
      } catch {
        apply(false);
        return;
      }
      if (Platform.OS === 'web') {
        apply(true);
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const response = await fetch('https://connectivitycheck.gstatic.com/generate_204', {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
        });
        apply(response.status === 204 || response.ok);
      } catch {
        apply(false);
      } finally {
        clearTimeout(timer);
      }
    };
    void readConnection();
    const unsubscribe = NetInfo.addEventListener(() => {
      void readConnection();
    });
    const poll = setInterval(() => {
      void readConnection();
    }, 4000);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;
    void import('@/utils/offlineQueue').then(({ subscribeOfflineQueue }) => {
      if (!active) {
        return;
      }
      unsubscribe = subscribeOfflineQueue((items) => {
        setPendingUploads(items.length);
        setSyncFailures(items.filter((item) => item.syncError).length);
        setQueuedThumbs(
          items.map((item) => ({
            projectId: item.projectId,
            locationId: item.locationId,
            stage: item.stage,
            localUri: item.stampedUri,
          })),
        );
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;
    void import('@/utils/reminders').then(({ subscribeReminders }) => {
      if (!active) {
        return;
      }
      unsubscribe = subscribeReminders((items) => {
        const now = Date.now();
        setNow(now);
        setStageReminders(
          items
            .filter((item) => item.triggerAt > now)
            .map((item) => ({
              projectId: item.projectId,
              locationId: item.locationId,
              stage: item.stage,
              triggerAt: item.triggerAt,
            })),
        );
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const visibleFirstId = visibleProjects[0]?.id;
  useEffect(() => {
    const previousId = newestProjectId.current;
    newestProjectId.current = visibleFirstId;
    if (previousId !== visibleFirstId) {
      scrollX.setValue(0);
      scrollerRef.current?.scrollTo({ x: 0, animated: false });
      syncScrollHint(0);
    }
  }, [visibleFirstId, scrollX, syncScrollHint]);
  const startWidth = scrollX.interpolate({
    inputRange: [0, SHRINK_DISTANCE],
    outputRange: [CARD_WIDTH, START_RAIL_WIDTH],
    extrapolate: 'clamp',
  });
  const startRadius = scrollX.interpolate({
    inputRange: [0, SHRINK_DISTANCE],
    outputRange: [CARD_RADIUS, 16],
    extrapolate: 'clamp',
  });
  const expandedOpacity = scrollX.interpolate({
    inputRange: [0, SHRINK_DISTANCE * 0.4],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const collapsedOpacity = scrollX.interpolate({
    inputRange: [SHRINK_DISTANCE * 0.45, SHRINK_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const onProjectScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
    useNativeDriver: false,
    listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncScrollHint(event.nativeEvent.contentOffset.x);
    },
  });
  const keepStartCardExpanded = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollX.setValue(0);
      if (event.nativeEvent.contentOffset.x > 0.5) {
        scrollerRef.current?.scrollTo({ x: 0, animated: false });
      }
    },
    [scrollX],
  );
  const shareProject = async (projectId: string, projectName: string) => {
    if (exportingProjectId) {
      return;
    }
    setExportingProjectId(projectId);
    try {
      const { exportProjectReport } = await import('@/utils/pdfReport');
      await exportProjectReport({ id: projectId, name: projectName });
    } catch (error) {
      Alert.alert(
        'Could not export report',
        error instanceof Error && error.message ? error.message : 'Could not create the PDF report.',
      );
    } finally {
      setExportingProjectId(null);
    }
  };
  const statusLabel =
    source === 'sample' ? 'Sample projects' : source === 'loading' ? 'Connecting to Firestore' : source === 'error' ? errorMessage : null;
  const pendingCompliance = activeProjects
    .filter((project) => project.projectMode !== 'quick')
    .flatMap((project) =>
      (project.pendingCompliance ?? []).map((item) => {
        const queued = queuedThumbs.find(
          (photo) =>
            photo.projectId === project.id && photo.locationId === item.locationId && photo.stage === item.currentStage,
        );
        const reminder = stageReminders.find(
          (entry) =>
            entry.projectId === project.id &&
            entry.locationId === item.locationId &&
            entry.stage === item.nextStage &&
            entry.triggerAt > now,
        );
        return {
          ...item,
          projectId: project.id,
          projectName: project.name,
          thumbnailUrl: queued?.localUri || item.thumbnailUrl,
          reminderAt: reminder?.triggerAt,
        };
      }),
    )
    .sort((left, right) => {
      const leftTime = new Date(left.capturedAt).getTime();
      const rightTime = new Date(right.capturedAt).getTime();
      return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
    });

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.brand}>
                BuildThread
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Company Profile"
              onPress={() => router.push('/company-profile')}
              style={({ pressed }) => [
                styles.profileButton,
                isDark ? styles.profileButtonDark : styles.profileButtonLight,
                pressed && styles.pressed,
              ]}>
              <SymbolView
                name={{ ios: 'building.2.fill', android: 'apartment', web: 'apartment' }}
                size={16}
                tintColor={isDark ? '#FFFFFF' : '#11181C'}
              />
              <Text style={[styles.profileButtonLabel, isDark && styles.profileButtonLabelDark]}>Company Profile</Text>
            </Pressable>
          </View>
          <ThemedText style={styles.heading}>Your Projects</ThemedText>
          {pendingUploads > 0 ? (
            <ThemedText type="small" style={styles.pendingUploads}>
              {pendingUploads === 1 ? '1 photo waiting to sync' : `${pendingUploads} photos waiting to sync`}
              {syncFailures > 0
                ? syncFailures === 1
                  ? ' · 1 failed and can be retried from the job'
                  : ` · ${syncFailures} failed and can be retried from the job`
                : ''}
            </ThemedText>
          ) : null}
          {!isOnline && source !== 'sample' ? (
            <ThemedText type="small" themeColor="textSecondary">
              Offline. Saved photos will sync when you reconnect.
            </ThemedText>
          ) : statusLabel ? (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={source === 'error' ? styles.errorLabel : undefined}>
              {statusLabel}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Firestore <Text style={styles.liveStatus}>Live</Text>
            </ThemedText>
          )}
        </View>

        <View style={[styles.filter, isDark ? styles.filterDark : styles.filterLight]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: projectFilter === 'active' }}
            onPress={() => setProjectFilter('active')}
            style={[styles.filterSegment, projectFilter === 'active' && styles.filterSegmentSelected]}>
            <Text style={[styles.filterLabel, projectFilter === 'active' && styles.filterLabelSelected]}>
              Active ({activeProjects.length})
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: projectFilter === 'completed' }}
            onPress={() => setProjectFilter('completed')}
            style={[styles.filterSegment, projectFilter === 'completed' && styles.filterSegmentSelected]}>
            <Text style={[styles.filterLabel, projectFilter === 'completed' && styles.filterLabelSelected]}>
              Completed ({completedProjects.length})
            </Text>
          </Pressable>
        </View>

        <View style={styles.projectRow}>
          <Animated.ScrollView
            ref={(node) => {
              scrollerRef.current = node;
            }}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scroller}
            contentContainerStyle={[
              styles.scrollerContent,
              hasVisibleProjects ? { paddingRight: projectCenterInset } : null,
            ]}
            scrollEnabled={hasVisibleProjects}
            bounces={hasVisibleProjects}
            alwaysBounceHorizontal={false}
            overScrollMode={hasVisibleProjects ? 'auto' : 'never'}
            scrollEventThrottle={16}
            nestedScrollEnabled
            snapToOffsets={hasVisibleProjects ? projectStopOffsets : undefined}
            decelerationRate="normal"
            onScroll={hasVisibleProjects ? onProjectScroll : keepStartCardExpanded}
            onScrollEndDrag={hasVisibleProjects ? undefined : keepStartCardExpanded}
            onMomentumScrollEnd={hasVisibleProjects ? undefined : keepStartCardExpanded}
            onContentSizeChange={(width) => {
              contentWidthRef.current = width;
              syncScrollHint(scrollOffsetRef.current);
            }}
            onLayout={(event) => {
              viewportWidthRef.current = event.nativeEvent.layout.width;
              syncScrollHint(scrollOffsetRef.current);
            }}>
            {visibleProjects.map((project) => {
              return (
              <View key={project.id} style={styles.cardFrame}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: '/project/[id]', params: { id: project.id, name: project.name } })
                  }
                  style={({ pressed }) => [
                    styles.card,
                    isDark ? styles.cardDark : styles.cardLight,
                    pressed && styles.pressed,
                  ]}>
                  <View style={[styles.statusRow, project.status === 'active' && styles.statusRowActive]}>
                    <View style={[styles.statusDot, project.status === 'active' ? styles.statusDotActive : styles.statusDotComplete]} />
                    <Text
                      style={[
                        styles.statusLabel,
                        project.status === 'active' ? styles.statusLabelActive : styles.statusLabelComplete,
                        isDark && project.status === 'active' && styles.statusLabelActiveDark,
                        isDark && project.status !== 'active' && styles.statusLabelDark,
                      ]}>
                      {project.status === 'archived' ? 'Archived' : project.status === 'completed' ? 'Completed' : 'Active'}
                    </Text>
                  </View>
                  {project.status === 'completed' ? (
                    <Text style={[styles.projectName, isDark && styles.projectNameDark]} numberOfLines={2}>
                      {project.name}
                    </Text>
                  ) : (
                    <View style={styles.projectNameWrap} pointerEvents="none">
                      <Text style={[styles.projectName, isDark && styles.projectNameDark]} numberOfLines={2}>
                        {project.name}
                      </Text>
                    </View>
                  )}
                  {project.status === 'completed' && project.endDate ? (
                    <Text style={[styles.endDate, styles.endDateWithActions, isDark && styles.endDateDark]} numberOfLines={1}>
                      {project.endDate}
                    </Text>
                  ) : project.status === 'completed' ? (
                    <View />
                  ) : null}
                </Pressable>
                <View style={styles.cardActions} pointerEvents="box-none">
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${project.name}`}
                    hitSlop={8}
                    onPress={() => router.push({ pathname: '/edit-project/[id]', params: { id: project.id } })}
                    style={[styles.cardAction, isDark ? styles.cardActionDark : styles.cardActionLight]}>
                    <Ionicons name="create-outline" size={22} color={isDark ? '#F8FAFC' : '#344054'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Share PDF for ${project.name}`}
                    accessibilityState={{ disabled: exportingProjectId !== null }}
                    disabled={exportingProjectId !== null}
                    hitSlop={8}
                    onPress={() => void shareProject(project.id, project.name)}
                    style={[styles.cardAction, isDark ? styles.cardActionDark : styles.cardActionLight]}>
                    {exportingProjectId === project.id ? (
                      <ActivityIndicator size="small" color={isDark ? '#F8FAFC' : '#344054'} />
                    ) : (
                      <Ionicons name="share-outline" size={22} color={isDark ? '#F8FAFC' : '#344054'} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              );
            })}
            {visibleProjects.length === 0 ? (
              <View
                style={[
                  styles.card,
                  styles.emptyCard,
                  { width: emptyCardWidth },
                  isDark ? styles.cardDark : styles.cardLight,
                ]}>
                <Text style={[styles.emptyTitle, isDark && styles.projectNameDark]}>
                  {projectFilter === 'completed' ? 'No completed jobs yet' : 'No active jobs'}
                </Text>
              </View>
            ) : null}
          </Animated.ScrollView>

          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => router.push('/new-project')}
            style={[styles.startCard, { width: startWidth, borderRadius: startRadius }]}>
            <Animated.View style={[styles.expandedContent, { opacity: expandedOpacity }]} pointerEvents="none">
              <View style={styles.plusBadge}>
                <Text style={styles.plus}>+</Text>
              </View>
              <View style={styles.startTitleWrap}>
                <Text style={styles.startTitleHorizontal}>Start New Project</Text>
              </View>
            </Animated.View>
            <Animated.View style={[styles.collapsedContent, { opacity: collapsedOpacity }]} pointerEvents="none">
              <View style={styles.collapsedPlus}>
                <View style={styles.plusBadge}>
                  <Text style={styles.plus}>+</Text>
                </View>
              </View>
            </Animated.View>
          </AnimatedPressable>
          {hasVisibleProjects && showScrollHint ? <ScrollEdgeHint isDark={isDark} style={styles.projectScrollHint} /> : null}
        </View>
        {pendingCompliance.length > 0 ? (
          <View style={styles.complianceSection}>
            <Text style={[styles.complianceHeading, isDark && styles.complianceHeadingDark]}>Pending Compliance Photos</Text>
            <View style={styles.complianceScroller}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.complianceRow}
              scrollEventThrottle={16}
              onScroll={(event) => syncPendingScrollHint(event.nativeEvent.contentOffset.x)}
              onContentSizeChange={(width) => {
                pendingContentWidthRef.current = width;
                syncPendingScrollHint(pendingOffsetRef.current);
              }}
              onLayout={(event) => {
                pendingViewportWidthRef.current = event.nativeEvent.layout.width;
                syncPendingScrollHint(pendingOffsetRef.current);
              }}>
              {pendingCompliance.map((item) => {
                const age = formatPhotoAge(item.capturedAt);
                const progression =
                  item.nextStage === 'during' ? 'Before ✓ → Needs During' : 'During ✓ → Needs After';
                return (
                  <Pressable
                    key={`${item.projectId}-${item.locationId}-${item.nextStage}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.projectName}, ${item.locationName}, ${progression}`}
                    onPress={() =>
                      router.push({
                        pathname: '/project/[id]',
                        params: { id: item.projectId, name: item.projectName },
                      })
                    }
                    style={[styles.complianceCard, isDark ? styles.complianceCardDark : styles.complianceCardLight]}>
                    <Image
                      source={{ uri: item.thumbnailUrl }}
                      style={styles.complianceThumb}
                      contentFit="cover"
                      accessibilityLabel={`${item.locationName} photo`}
                    />
                    <Text style={[styles.complianceProject, isDark && styles.complianceTextDark]} numberOfLines={1}>
                      {item.projectName}
                    </Text>
                    <Text style={[styles.complianceLocation, isDark && styles.complianceMutedDark]} numberOfLines={1}>
                      {item.locationName}
                    </Text>
                    <Text style={styles.complianceProgress}>{progression}</Text>
                    {age ? <Text style={[styles.complianceAge, isDark && styles.complianceMutedDark]}>{age}</Text> : null}
                    {item.reminderAt ? (
                      <View style={styles.complianceAlarm}>
                        <Text style={styles.complianceAlarmLabel}>⏰ {formatReminderWhen(item.reminderAt)}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            {showPendingScrollHint ? <ScrollEdgeHint isDark={isDark} style={styles.pendingScrollHint} /> : null}
            </View>
          </View>
        ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const CARD_WIDTH = 168;
const CARD_HEIGHT = 176;
const CARD_RADIUS = 22;
const START_RAIL_WIDTH = 40;
const SHRINK_DISTANCE = CARD_WIDTH - START_RAIL_WIDTH;
const EMPTY_ROW_INSET = Spacing.four + CARD_WIDTH + Spacing.two + Spacing.four;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const cardShadow = {
  shadowColor: '#0B1220',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.12,
  shadowRadius: 18,
  elevation: 8,
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'web' ? 76 : 0,
  },
  homeScroll: {
    flex: 1,
  },
  homeScrollContent: {
    paddingBottom: Spacing.four,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.one,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  profileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.one,
  },
  profileButtonLight: {
    backgroundColor: '#F0F0F3',
  },
  profileButtonDark: {
    backgroundColor: '#212225',
  },
  profileButtonLabel: {
    color: '#11181C',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  profileButtonLabelDark: {
    color: '#FFFFFF',
  },
  brand: {
    fontSize: 17,
    lineHeight: 22,
  },
  heading: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  pendingUploads: {
    color: '#B54708',
    fontWeight: '700',
  },
  liveStatus: {
    color: '#12B76A',
    fontWeight: '700',
  },
  offlineStatus: {
    color: '#B42318',
    fontWeight: '700',
  },
  errorLabel: {
    color: '#B42318',
  },
  filter: {
    flexDirection: 'row',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  filterLight: {
    backgroundColor: '#F0F0F3',
  },
  filterDark: {
    backgroundColor: '#212225',
  },
  filterSegment: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  filterSegmentSelected: {
    backgroundColor: '#208AEF',
  },
  filterLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#60646C',
  },
  filterLabelSelected: {
    color: '#FFFFFF',
  },
  projectRow: {
    position: 'relative',
  },
  scrollHint: {
    position: 'absolute',
    right: 0,
    zIndex: 3,
    width: 72,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  projectScrollHint: {
    top: Spacing.two,
    height: CARD_HEIGHT,
  },
  pendingScrollHint: {
    top: 0,
    bottom: Spacing.three,
  },
  scrollHintFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  scrollHintChevron: {
    width: 28,
    height: 28,
    marginRight: 8,
    borderRadius: 14,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  complianceSection: {
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  complianceScroller: {
    position: 'relative',
  },
  complianceHeading: {
    paddingHorizontal: Spacing.four,
    color: '#11181C',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  complianceHeadingDark: {
    color: '#F8FAFC',
  },
  complianceRow: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  complianceCard: {
    width: 196,
    borderRadius: 16,
    padding: Spacing.two,
    gap: 4,
  },
  complianceCardLight: {
    backgroundColor: '#F0F0F3',
  },
  complianceCardDark: {
    backgroundColor: '#212225',
  },
  complianceThumb: {
    width: '100%',
    height: 84,
    borderRadius: 12,
    backgroundColor: '#E4E4E7',
  },
  complianceProject: {
    color: '#11181C',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  complianceTextDark: {
    color: '#F8FAFC',
  },
  complianceLocation: {
    color: '#475467',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  complianceMutedDark: {
    color: '#D0D5DD',
  },
  complianceProgress: {
    color: '#208AEF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  complianceAge: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  complianceAlarm: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FEF0C7',
  },
  complianceAlarmLabel: {
    color: '#B54708',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  scroller: {
    flexGrow: 0,
  },
  scrollerContent: {
    paddingLeft: Spacing.four + CARD_WIDTH + Spacing.two,
    paddingRight: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
  },
  startCard: {
    position: 'absolute',
    left: Spacing.four,
    top: Spacing.two,
    zIndex: 2,
    height: CARD_HEIGHT,
    overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
    backgroundColor: '#208AEF',
    shadowColor: '#208AEF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  expandedContent: {
    flex: 1,
    padding: Spacing.three,
  },
  startTitleWrap: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  plusBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  plus: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '500',
    marginTop: -2,
  },
  startTitleHorizontal: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  collapsedContent: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  collapsedPlus: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFrame: {
    position: 'relative',
  },
  cardActions: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  cardActionDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: CARD_RADIUS,
    padding: Spacing.three,
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    ...cardShadow,
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  cardDark: {
    backgroundColor: '#1C1F26',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowOpacity: 0.4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusRowActive: {
    marginTop: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotActive: {
    backgroundColor: '#208AEF',
  },
  statusDotComplete: {
    backgroundColor: '#12B76A',
  },
  statusLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statusLabelActive: {
    color: '#175CD3',
  },
  statusLabelActiveDark: {
    color: '#84CAFF',
  },
  statusLabelComplete: {
    color: '#067647',
  },
  statusLabelDark: {
    color: '#6CE9A6',
  },
  endDate: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#475467',
  },
  endDateDark: {
    color: '#D0D5DD',
  },
  endDateWithActions: {
    marginRight: 96,
  },
  emptyCard: {
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#475467',
  },
  projectNameWrap: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  projectName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  projectNameDark: {
    color: '#F8FAFC',
  },
});

