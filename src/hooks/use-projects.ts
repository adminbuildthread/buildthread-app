import { useEffect, useState } from 'react';

import { isFirebaseConfigured, type ProjectRecord } from '@/lib/firebase-config';
import { cacheProjectList, readCachedProjectList } from '@/lib/local-cache';

export type Project = ProjectRecord;

export const SAMPLE_PROJECTS: Project[] = [
  { id: 'riverside-loft', name: 'Riverside Loft' },
  { id: 'oak-street-kitchen', name: 'Oak Street Kitchen' },
  { id: 'harbor-studio', name: 'Harbor Studio' },
  { id: 'maple-annex', name: 'Maple Annex' },
];

type ProjectSource = 'sample' | 'loading' | 'live' | 'error';

type ProjectsState = {
  projects: Project[];
  source: ProjectSource;
  errorMessage: string | null;
};

function firestoreErrorMessage(error: { code: string }): string {
  if (error.code === 'permission-denied') {
    return 'Firestore blocked this read. Allow client access to the projects collection in your security rules.';
  }
  if (error.code === 'not-found') {
    return 'That Firestore database was not found. Check EXPO_PUBLIC_FIREBASE_DATABASE_ID.';
  }
  return 'Could not load projects from Firestore.';
}

export function useProjects(): ProjectsState {
  const configured = isFirebaseConfigured();
  const [state, setState] = useState<ProjectsState>({
    projects: configured ? [] : SAMPLE_PROJECTS,
    source: configured ? 'loading' : 'sample',
    errorMessage: null,
  });

  useEffect(() => {
    if (!configured) {
      return;
    }

    let unsubscribe = () => {};
    let active = true;

    Promise.all([import('@/lib/firebase-auth'), import('@/lib/subscribe-projects')])
      .then(([{ getProjectAuth, onAuthStateChanged }, { subscribeToProjects }]) => {
        if (!active) {
          return;
        }
        let unsubscribeProjects = () => {};
        const unsubscribeAuth = onAuthStateChanged(getProjectAuth(), (user) => {
          queueMicrotask(() => {
            if (!active) {
              return;
            }
            unsubscribeProjects();
            unsubscribeProjects = () => {};
            if (!user) {
              setState({ projects: [], source: 'live', errorMessage: null });
              return;
            }
            unsubscribeProjects = subscribeToProjects(
              user.uid,
              (projects) => {
                if (!active) {
                  return;
                }
                setState({ projects, source: 'live', errorMessage: null });
                void cacheProjectList(projects);
              },
              (error) => {
                if (!active) {
                  return;
                }
                void readCachedProjectList<Project[]>().then((cached) => {
                  if (!active) {
                    return;
                  }
                  if (cached && cached.length > 0) {
                    setState({ projects: cached, source: 'live', errorMessage: null });
                    return;
                  }
                  setState({
                    projects: [],
                    source: 'error',
                    errorMessage: firestoreErrorMessage(error),
                  });
                });
              },
            );
          });
        });
        unsubscribe = () => {
          unsubscribeAuth();
          unsubscribeProjects();
        };
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setState({
          projects: [],
          source: 'error',
          errorMessage: 'Could not load projects from Firestore.',
        });
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [configured]);

  return state;
}
