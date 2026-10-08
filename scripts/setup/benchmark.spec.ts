import { describe, expect, it } from 'vitest';
import { pickFiles, recommendWorkers, splitAcrossWorkers, type BenchmarkResult } from './benchmark.js';

const file = (name: string, minutes: number) => ({ path: `/${name}.mp3`, minutes });
const result = (workers: number, throughput: number, failures = 0): BenchmarkResult => ({ workers, throughput, failures, audioMinutes: 120, wallMinutes: 120 / throughput });

describe('transcription benchmark', () => {
  it('picks files up to the target, skipping very short and very long ones', () => {
    const files = [file('trailer', 2), file('a', 40), file('marathon', 300), file('b', 50), file('c', 30)];
    expect(pickFiles(files, 60).map(f => f.path)).toEqual(['/a.mp3', '/b.mp3']);
    expect(pickFiles(files, 10, 3).map(f => f.path)).toEqual(['/a.mp3', '/b.mp3', '/c.mp3']);
    expect(pickFiles(files, 10, 2, 40).map(f => f.path)).toEqual(['/a.mp3', '/c.mp3']);
  });

  it('balances files across workers by duration', () => {
    const queues = splitAcrossWorkers([file('a', 60), file('b', 30), file('c', 30), file('d', 20)], 2);
    expect(queues.map(q => q.reduce((sum, f) => sum + f.minutes, 0)).sort()).toEqual([60, 80]);
    expect(splitAcrossWorkers([file('a', 10)], 3)).toHaveLength(1);
  });

  it('recommends the fewest workers close to the best throughput', () => {
    // session 1, M4 Pro: 24.7, 35.2, 47.6, 50.7 → 4 is within 7% of... 3 (47.6) is 6.1% below 50.7
    expect(recommendWorkers([result(1, 24.7), result(2, 35.2), result(3, 47.6), result(4, 50.7)])).toBe(3);
    expect(recommendWorkers([result(1, 20), result(2, 30), result(3, 30.5)])).toBe(2);
    expect(recommendWorkers([result(1, 20), result(2, 40, 1)])).toBe(1);
    expect(recommendWorkers([])).toBe(1);
  });
});
