import { describe, expect, it } from 'vitest';
import { transcriptionTimeoutMs } from './transcribe-via-whisper.js';

describe('transcriptionTimeoutMs', () => {
  it('defaults to 150 s, doubled for the retry', () => {
    expect(transcriptionTimeoutMs(1, {})).toBe(150_000);
    expect(transcriptionTimeoutMs(2, {})).toBe(300_000);
  });

  it('uses WHISPER_TIMEOUT_SECONDS for the first attempt', () => {
    expect(transcriptionTimeoutMs(1, { WHISPER_TIMEOUT_SECONDS: '3600' })).toBe(3_600_000);
    expect(transcriptionTimeoutMs(2, { WHISPER_TIMEOUT_SECONDS: '3600' })).toBe(7_200_000);
  });

  it('ignores an empty or invalid value', () => {
    expect(transcriptionTimeoutMs(1, { WHISPER_TIMEOUT_SECONDS: '' })).toBe(150_000);
    expect(transcriptionTimeoutMs(1, { WHISPER_TIMEOUT_SECONDS: 'abc' })).toBe(150_000);
    expect(transcriptionTimeoutMs(1, { WHISPER_TIMEOUT_SECONDS: '-5' })).toBe(150_000);
  });
});
