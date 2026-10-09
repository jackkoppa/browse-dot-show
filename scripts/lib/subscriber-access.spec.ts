import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { isSubscriberIndexStale, tfvarsEnableSubscriberAccess } from './subscriber-access.js';

describe('tfvarsEnableSubscriberAccess', () => {
  it('reads the setting, ignoring comments', () => {
    expect(tfvarsEnableSubscriberAccess('site_id = "x"\nenable_subscriber_access = true\n')).toBe(true);
    expect(tfvarsEnableSubscriberAccess('enable_subscriber_access   =   true # bucket deny is on')).toBe(true);
    expect(tfvarsEnableSubscriberAccess('# enable_subscriber_access = true')).toBe(false);
    expect(tfvarsEnableSubscriberAccess('enable_subscriber_access = false')).toBe(false);
    expect(tfvarsEnableSubscriberAccess('site_id = "x"')).toBe(false);
  });
});

describe('isSubscriberIndexStale', () => {
  let root: string;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function write(relative: string, mtimeSeconds: number) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
    fs.utimesSync(file, mtimeSeconds, mtimeSeconds);
  }

  it('is stale without a subscriber index, once there is something to index', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-subscriber-'));
    expect(isSubscriberIndexStale(root)).toBe(false);
    write('search-index/orama_index.msp', 100);
    expect(isSubscriberIndexStale(root)).toBe(true);
  });

  it('is stale when the public index or a subscriber transcript is newer', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-subscriber-'));
    write('search-index/orama_index.msp', 100);
    write('subscriber/transcripts/pod/a.srt', 100);
    write('subscriber/search-index/orama_index.msp', 200);
    expect(isSubscriberIndexStale(root)).toBe(false);

    write('search-index/orama_index.msp', 300);
    expect(isSubscriberIndexStale(root)).toBe(true);

    write('subscriber/search-index/orama_index.msp', 400);
    write('subscriber/transcripts/pod/b.srt', 500);
    expect(isSubscriberIndexStale(root)).toBe(true);
  });
});
