
// Utility function to format milliseconds to MM:SS
export const formatMillisecondsToMMSS = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Utility function to format milliseconds to seconds, rounded to the nearest second
export const formatMillisecondsToRoundSeconds = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    return totalSeconds.toString();
};