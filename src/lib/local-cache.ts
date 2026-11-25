import AsyncStorage from '@react-native-async-storage/async-storage';

const PROJECTS_KEY = '@buildthread_projects_cache';

function projectKey(projectId: string): string {
  return `@buildthread_project_${projectId}`;
}

export async function cacheJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheProjectList(value: unknown): Promise<void> {
  await cacheJson(PROJECTS_KEY, value);
}

export async function readCachedProjectList<T>(): Promise<T | null> {
  return readJson<T>(PROJECTS_KEY);
}

export async function cacheProjectDetail(projectId: string, value: unknown): Promise<void> {
  await cacheJson(projectKey(projectId), value);
}

export async function readCachedProjectDetail<T>(projectId: string): Promise<T | null> {
  return readJson<T>(projectKey(projectId));
}
