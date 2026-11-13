import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type RefObject } from 'react';
import {
  MAX_EPISODE_LABEL_LENGTH,
  MAX_IMAGE_LENGTH,
  MAX_TITLE_NAME_LENGTH,
  type SaveWatchProgressRequest,
  type WatchProgressEpisode,
} from '../../../../api/src/watch-progress/contract.ts';
import { api } from '../api/client.ts';
import { SESSION_KEY, useSession } from '../auth/session.ts';
import { createSaver, type Snapshot } from './saver.ts';
import { toSaveOutcome } from './save-outcome.ts';
import { progressKey } from './use-progress.ts';

function mergeRow(
  rows: WatchProgressEpisode[],
  row: WatchProgressEpisode,
): WatchProgressEpisode[] {
  return rows.some((r) => r.episodeId === row.episodeId)
    ? rows.map((r) => (r.episodeId === row.episodeId ? row : r))
    : [...rows, row];
}

export interface ProgressTarget {
  slug: string;
  seasonSlug: string;
  seriesKey?: string;
  episodeId: string;
  titleName: string;
  image?: string;
  episodeLabel: string;
}

// Saves the position of the episode on screen. The video element is the source of truth, but the last
// time it reported is what gets saved: by the time an episode change or an unmount runs this cleanup,
// the stream is already torn down and the element reads 0.
export function useProgressSaving(
  videoRef: RefObject<HTMLVideoElement | null>,
  target: ProgressTarget,
) {
  const queryClient = useQueryClient();
  const signedIn = useSession().state === 'signedIn';
  const {
    slug,
    seasonSlug,
    seriesKey,
    episodeId,
    titleName,
    image,
    episodeLabel,
  } = target;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !signedIn) return;

    let snapshot: Snapshot | null = null;
    // The saved position must not be overwritten by the 0 the video reports before the resume seek lands.
    let ready = false;
    const remember = () => {
      snapshot = { positionS: video.currentTime, durationS: video.duration };
    };

    const saver = createSaver({
      meta: {
        slug,
        seasonSlug,
        seriesKey,
        episodeId,
        titleName: titleName.slice(0, MAX_TITLE_NAME_LENGTH),
        image: image && image.length <= MAX_IMAGE_LENGTH ? image : '',
        episodeLabel: episodeLabel.slice(0, MAX_EPISODE_LABEL_LENGTH),
      },
      read: () => (ready ? snapshot : null),
      send: (body: SaveWatchProgressRequest, { keepalive }) =>
        toSaveOutcome(
          api.put('v1/watch-progress', { json: body, keepalive }).json(),
        ),
      // The save answers with the stored row, so the cache takes it as is and nothing is refetched.
      onSaved: (row) =>
        queryClient.setQueryData<WatchProgressEpisode[]>(
          progressKey(slug),
          (rows) => rows && mergeRow(rows, row),
        ),
      // A 401 means the session is gone: the session query decides what every other consumer shows.
      onUnauthorized: () =>
        void queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
    });

    const keepalive = () => saver.save({ keepalive: true });
    const settle = () => {
      remember();
      saver.setPlaying(false);
      saver.save();
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') keepalive();
    };
    const listeners: [string, () => void][] = [
      ['canplay', () => ((ready = true), remember())],
      ['timeupdate', remember],
      ['seeked', remember],
      ['durationchange', remember],
      ['playing', () => saver.setPlaying(true)],
      ['pause', settle],
      ['ended', settle],
    ];
    for (const [type, listener] of listeners) {
      video.addEventListener(type, listener);
    }
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', keepalive);
    if (!video.paused) saver.setPlaying(true);

    return () => {
      for (const [type, listener] of listeners) {
        video.removeEventListener(type, listener);
      }
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', keepalive);
      keepalive();
      saver.dispose();
    };
  }, [
    videoRef,
    queryClient,
    signedIn,
    slug,
    seasonSlug,
    seriesKey,
    episodeId,
    titleName,
    image,
    episodeLabel,
  ]);
}
