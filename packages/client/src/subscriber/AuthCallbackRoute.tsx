import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { SubscriberLoginProvider } from '@browse-dot-show/sites';
import { trackEvent } from '../utils/goatcounter';
import { useSubscriber } from './SubscriberContext';

/**
 * `/auth/callback`: where a provider's login link returns the listener. Sends the query params
 * to the auth API, then goes back to search.
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
      setMessage("This login link isn't valid here.");
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
