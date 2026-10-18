import { describe, expect, it } from 'vitest';
import { createDevCodeProvider } from './dev-code.js';

const callbackUrl = 'https://listenfairplay.com/auth/callback';

describe('dev-code provider', () => {
  const provider = createDevCodeProvider({ code: 'correct-horse-battery-staple' });

  it('accepts the code, with a cleaned-up label', async () => {
    expect(await provider.startLogin({ callbackUrl, loginLinkFor: async () => callbackUrl, oauth: { redirectUri: '', state: '' } })).toEqual({ kind: 'enter-code' });
    expect(await provider.completeLogin({ code: 'correct-horse-battery-staple', label: 'jack <laptop>' })).toEqual({ providerUserId: 'jacklaptop' });
    expect(await provider.completeLogin({ code: 'correct-horse-battery-staple' })).toEqual({ providerUserId: 'dev' });
  });

  it('rejects other codes', async () => {
    expect(await provider.completeLogin({ code: 'wrong' })).toBeNull();
    expect(await provider.completeLogin({})).toBeNull();
  });

  it('requires a long code', () => {
    expect(() => createDevCodeProvider({ code: 'short' })).toThrow();
  });
});
