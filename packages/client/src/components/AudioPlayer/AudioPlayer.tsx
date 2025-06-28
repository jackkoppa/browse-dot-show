import { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import AudioPlayerH5, { RHAP_UI } from 'react-h5-audio-player';
import { PlayIcon, PauseIcon } from '@radix-ui/react-icons';
import { cn } from '@browse-dot-show/ui';

import Skip15SecondsBack from '../../icons/skip-15-seconds-back.svg?react';
import Skip15SecondsForward from '../../icons/skip-15-seconds-forward.svg?react';
import './AudioPlayer.module.css';

const baseIconButtonStyle = 'flex items-center justify-center w-10 h-10';

// Custom play/pause icon elements (NOT buttons - the library will wrap them in buttons)
const PlayIconElement = (
  // Given that we can't use <Button> here, we'll roughly attempt to match the styling from `import { Button } from '@browse-dot-show/ui'`
  <div className={cn(baseIconButtonStyle, '-mt-1 bg-primary text-primary-foreground shadow-xs hover:bg-primary/90')}>
    <PlayIcon className="w-8 h-8" />
  </div>
);

const PauseIconElement = (
  // Given that we can't use <Button> here, we'll roughly attempt to match the styling from `import { Button } from '@browse-dot-show/ui'`
  <div className={cn(baseIconButtonStyle, '-mt-1 bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60')}>
    <PauseIcon className="w-8 h-8" />
  </div>
);

const skipIconButtonStyle = 'mt-[-2px] ml-[-3px] hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50';

// Custom 15-second backward icon
const Skip15BackwardElement = (
  <div className={cn(baseIconButtonStyle, skipIconButtonStyle)}>
    <Skip15SecondsBack className="w-6 h-6" />
  </div>
);

// Custom 15-second forward icon
const Skip15ForwardElement = (
  <div className={cn(baseIconButtonStyle, skipIconButtonStyle)}>
    <Skip15SecondsForward className="w-6 h-6" />
  </div>
);

interface AudioPlayerProps {
  src: string;
  onListen: (currentTimeMs: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: () => void;
  onLimitExceededClick?: () => void;
  className?: string;
  isLimitExceeded?: boolean;
}

export interface AudioPlayerRef {
  seekTo: (timeMs: number) => void;
  pause: () => void;
}

const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(({
  src,
  className,
  onListen,
  onPlay,
  onPause,
  onSeek,
  onLimitExceededClick,
  isLimitExceeded = false
}, ref) => {
  const [isLoading, setIsLoading] = useState(false);
  const playerRef = useRef<AudioPlayerH5>(null);

  // Expose seekTo and pause methods to parent component
  useImperativeHandle(ref, () => ({
    seekTo: (timeMs: number) => {
      if (playerRef.current?.audio?.current) {
        playerRef.current.audio.current.currentTime = timeMs / 1000; // Convert ms to seconds
      }
    },
    pause: () => {
      if (playerRef.current?.audio?.current) {
        playerRef.current.audio.current.pause();
      }
    }
  }));

  const handleLoadStart = () => {
    setIsLoading(true);
  };

  const handleCanPlay = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
  };

  const handleListen = (event: Event) => {
    const audio = event.target as HTMLAudioElement;
    const currentTimeMs = audio.currentTime * 1000; // Convert seconds to milliseconds
    onListen(currentTimeMs);
  };

  const handlePlay = () => {
    // Don't allow play if limit exceeded
    if (isLimitExceeded) return;
    
    if (onPlay) {
      onPlay();
    }
  };

  const handlePause = () => {
    if (onPause) {
      onPause();
    }
  };

  const handleSeek = () => {
    if (onSeek) {
      onSeek();
    }
  };

  const handleLimitExceededClick = () => {
    if (isLimitExceeded && onLimitExceededClick) {
      onLimitExceededClick();
    }
  };

  return (
    <div 
      className={cn('w-full', className)}
      onClick={isLimitExceeded ? handleLimitExceededClick : undefined}
      style={isLimitExceeded ? { cursor: 'pointer' } : undefined}
    >
      <AudioPlayerH5
        ref={playerRef}
        src={src}
        autoPlay={false}
        showJumpControls={true}
        showDownloadProgress={true}
        showFilledProgress={true}
        showSkipControls={false}
        showFilledVolume={true}
        hasDefaultKeyBindings={true}
        preload="metadata"
        progressJumpSteps={{
          backward: 15000, // 15 seconds backward
          forward: 15000   // 15 seconds forward
        }}
        onLoadStart={handleLoadStart}
        onCanPlay={handleCanPlay}
        onError={handleError}
        onPlay={handlePlay}
        onPause={handlePause}
        onListen={handleListen}
        onAbort={handleSeek}
        onSeeked={handleSeek}
        customVolumeControls={[]}
        customAdditionalControls={[]}
        customIcons={{
          play: PlayIconElement,
          pause: PauseIconElement,
          rewind: Skip15BackwardElement,
          forward: Skip15ForwardElement,
        }}
        loop={false}
        muted={false}
        volume={1}
        layout='stacked'
        customControlsSection={[RHAP_UI.CURRENT_TIME, RHAP_UI.MAIN_CONTROLS, RHAP_UI.CURRENT_LEFT_TIME]}
        customProgressBarSection={[RHAP_UI.PROGRESS_BAR]}
        className={cn(
          'rhap_container',
          isLoading && 'opacity-75',
          isLimitExceeded && 'pointer-events-none opacity-50'
        )}
      />
    </div>
  );
});

AudioPlayer.displayName = 'AudioPlayer';

export default AudioPlayer; 