import { useState, useEffect, useCallback, useRef } from 'react';

// const PLAY_TIME_LIMIT_MS = 0.1 * 60 * 1000; // FOR TESTING - 0.1 minutes in milliseconds
const PLAY_TIME_LIMIT_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
const SESSION_STORAGE_KEY_PREFIX = 'episode_play_time_';

interface PlayTimeTracker {
  totalPlayedMs: number;
  lastUpdateTime: number | null;
  isPlaying: boolean;
}

interface UsePlayTimeLimitReturn {
  isLimitExceeded: (episodeId: string) => boolean;
  getRemainingTime: (episodeId: string) => number;
  onPlay: (episodeId: string) => void;
  onPause: (episodeId: string) => void;
  onSeek: (episodeId: string) => void;
  checkAndHandleLimit: (episodeId: string) => boolean; // returns true if limit just exceeded
}

export function usePlayTimeLimit(): UsePlayTimeLimitReturn {
  // In-memory trackers for current session
  const trackersRef = useRef<Map<string, PlayTimeTracker>>(new Map());
  const [limitExceededEpisodes, setLimitExceededEpisodes] = useState<Set<string>>(new Set());

  // Get or create tracker for an episode
  const getTracker = useCallback((episodeId: string): PlayTimeTracker => {
    if (!trackersRef.current.has(episodeId)) {
      // Load from sessionStorage if available
      const savedTime = sessionStorage.getItem(`${SESSION_STORAGE_KEY_PREFIX}${episodeId}`);
      const totalPlayedMs = savedTime ? parseInt(savedTime, 10) || 0 : 0;
      
      trackersRef.current.set(episodeId, {
        totalPlayedMs,
        lastUpdateTime: null,
        isPlaying: false
      });
    }
    return trackersRef.current.get(episodeId)!;
  }, []);

  // Save tracker to sessionStorage
  const saveTracker = useCallback((episodeId: string, tracker: PlayTimeTracker) => {
    sessionStorage.setItem(`${SESSION_STORAGE_KEY_PREFIX}${episodeId}`, tracker.totalPlayedMs.toString());
  }, []);

  // Update play time and check limit
  const updatePlayTime = useCallback((episodeId: string) => {
    const tracker = getTracker(episodeId);
    
    if (tracker.isPlaying && tracker.lastUpdateTime) {
      const currentTime = Date.now();
      const deltaMs = currentTime - tracker.lastUpdateTime;
      tracker.totalPlayedMs += deltaMs;
      tracker.lastUpdateTime = currentTime;
      
      // Save to sessionStorage
      saveTracker(episodeId, tracker);
      
      // Check if limit exceeded
      if (tracker.totalPlayedMs >= PLAY_TIME_LIMIT_MS) {
        setLimitExceededEpisodes(prev => new Set([...prev, episodeId]));
        tracker.isPlaying = false;
        tracker.lastUpdateTime = null;
        return true; // Limit just exceeded
      }
    }
    
    return false;
  }, [getTracker, saveTracker]);

  // Set up interval to update play time every second
  useEffect(() => {
    const interval = setInterval(() => {
      trackersRef.current.forEach((tracker, episodeId) => {
        if (tracker.isPlaying) {
          updatePlayTime(episodeId);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [updatePlayTime]);

  const isLimitExceeded = useCallback((episodeId: string): boolean => {
    return limitExceededEpisodes.has(episodeId) || getTracker(episodeId).totalPlayedMs >= PLAY_TIME_LIMIT_MS;
  }, [limitExceededEpisodes, getTracker]);

  const getRemainingTime = useCallback((episodeId: string): number => {
    const tracker = getTracker(episodeId);
    return Math.max(0, PLAY_TIME_LIMIT_MS - tracker.totalPlayedMs);
  }, [getTracker]);

  const onPlay = useCallback((episodeId: string) => {
    const tracker = getTracker(episodeId);
    
    // Don't allow play if limit exceeded
    if (tracker.totalPlayedMs >= PLAY_TIME_LIMIT_MS) {
      setLimitExceededEpisodes(prev => new Set([...prev, episodeId]));
      return;
    }
    
    tracker.isPlaying = true;
    tracker.lastUpdateTime = Date.now();
  }, [getTracker]);

  const onPause = useCallback((episodeId: string) => {
    const tracker = getTracker(episodeId);
    
    if (tracker.isPlaying && tracker.lastUpdateTime) {
      const currentTime = Date.now();
      const deltaMs = currentTime - tracker.lastUpdateTime;
      tracker.totalPlayedMs += deltaMs;
      
      // Save to sessionStorage
      saveTracker(episodeId, tracker);
    }
    
    tracker.isPlaying = false;
    tracker.lastUpdateTime = null;
  }, [getTracker, saveTracker]);

  const onSeek = useCallback((episodeId: string) => {
    // When seeking, update the play time if currently playing
    updatePlayTime(episodeId);
  }, [updatePlayTime]);

  const checkAndHandleLimit = useCallback((episodeId: string): boolean => {
    return updatePlayTime(episodeId);
  }, [updatePlayTime]);

  return {
    isLimitExceeded,
    getRemainingTime,
    onPlay,
    onPause,
    onSeek,
    checkAndHandleLimit
  };
} 