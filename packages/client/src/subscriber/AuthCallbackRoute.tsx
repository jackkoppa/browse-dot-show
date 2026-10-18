import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { SubscriberLoginProvider } from '@browse-dot-show/sites';
import { trackEvent } from '../utils/goatcounter';
import { useSubscriber } from './SubscriberContext';

/** What the auth API's `error` param means (OAuth logins come back with one when they fail) */
export const CALLBACK_ERRORS: Record<string, string> = {
  'not-a-subscriber': "We couldn't find an active subscription for that account.",
  cancelled: 'Login was cancelled.',
  'link-already-used': 'That login link was already used. Please log in again.',
  'provider-not-configured': "Logging in with this service isn't set up yet.",
  'too-many-requests': 'Too many login attempts. Please try again later.',
};
const DEFAULT_CALLBACK_ERROR = 'Something went wrong while logging in. Please try again later.';

/**
 * `/auth/callback`: where a login returns the listener (an emailed link, or the auth API after an
 * OAuth login). Sends the query params to the auth API, then goes back to search.
 */
export default function AuthCallbackRoute() {
  const subscriber = useSubscriber();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Logging you in…');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const provider = searchParams.get('provider') as SubscriberLoginProvider | null;
    if (!subscriber.available || !provider || !subscriber.providers.includes(provider)) {
      // The preview flag lives in this browser: links opened elsewhere land here
      setMessage("This login link isn't valid here. Open it in the browser where you started logging in.");
      return;
    }
    const errorCode = searchParams.get('error');
    if (errorCode) {
      setMessage(CALLBACK_ERRORS[errorCode] ?? DEFAULT_CALLBACK_ERROR);
      return;
    }
    const params = Object.fromEntries([...searchParams.entries()].filter(([key]) => key !== 'provider'));
    subscriber.completeLogin(provider, params)
      .then(ok => {
        if (ok) {
          trackEvent({ eventType: 'Subscriber Logged In' });
          navigate('/', { replace: true });
        } else {
          setMessage("We couldn't find an active subscription for that login. The link may have expired: try logging in again.");
        }
      })
      .catch(error => setMessage(`Login failed: ${(error as Error).message}`));
  }, [subscriber, searchParams, navigate]);

  return (
    <div className="bg-background max-w-3xl mx-auto p-4 font-mono pt-32 min-h-screen">
      <p className="text-center">{message}</p>
      <p className="text-center mt-4"><a href="/" className="underline">Back to search</a></p>
    </div>
  );
}
