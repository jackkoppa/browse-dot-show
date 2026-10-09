import { useState, type FormEvent } from 'react';
import { Button, Input } from '@browse-dot-show/ui';
import { LockClosedIcon, LockOpen1Icon } from '@radix-ui/react-icons';
import ResponsiveDrawerOrDialog from '../components/ResponsiveDrawerOrDialog';
import siteConfig from '../config/site-config';
import { trackEvent } from '../utils/goatcounter';
import { log } from '../utils/logging';
import { startLogin } from './api';
import { useSubscriber } from './SubscriberContext';

/** The header's subscriber button: log in (email link or dev code), or see you're logged in and log out */
export default function SubscriberLoginDialog() {
  const subscriber = useSubscriber();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'email-sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  if (!subscriber.available || !subscriber.config) return null;
  const { config } = subscriber;

  const trigger = (
    <Button variant="ghost" size="icon" aria-label={subscriber.isSubscriber ? 'Subscriber account' : 'Subscriber login'}>
      {subscriber.isSubscriber ? <LockOpen1Icon className="size-6" /> : <LockClosedIcon className="size-6" />}
    </Button>
  );

  const handleEmailLogin = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('sending');
    setMessage(null);
    try {
      await startLogin(config.authApiUrl, { siteId: siteConfig.id, provider: 'supporting-cast', email });
      setStatus('email-sent');
      trackEvent({ eventType: 'Subscriber Login Email Requested' });
    } catch (error) {
      log.warn('[subscriber] Login request failed', error);
      setStatus('error');
      setMessage((error as Error).message);
    }
  };

  const handleCodeLogin = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('sending');
    setMessage(null);
    try {
      const ok = await subscriber.completeLogin('dev-code', { code });
      setStatus(ok ? 'idle' : 'error');
      setMessage(ok ? null : "That code didn't work.");
      if (ok) trackEvent({ eventType: 'Subscriber Logged In' });
    } catch (error) {
      setStatus('error');
      setMessage((error as Error).message);
    }
  };

  return (
    <ResponsiveDrawerOrDialog
      childTrigger={trigger}
      title={subscriber.isSubscriber ? 'Subscriber' : 'Subscriber login'}
      description={`Log in with your ${config.subscriptionName} subscription`}
      descriptionHidden={true}
    >
      <div className="text-sm xs:text-base flex flex-col gap-4 pb-4">
        {subscriber.isSubscriber ? (
          <>
            <p>You're logged in with your <strong>{config.subscriptionName}</strong> subscription: subscriber-only episodes show up in search, and there's no listening limit.</p>
            <Button variant="outline" onClick={subscriber.logout}>Log out</Button>
          </>
        ) : (
          <>
            <p>
              <strong>{config.subscriptionName}</strong> subscribers can log in to also search subscriber-only episodes, and listen without a time limit.
            </p>

            {subscriber.providers.includes('supporting-cast') && (
              status === 'email-sent' ? (
                <p className="p-3 bg-muted rounded-md">If <strong>{email}</strong> has a subscription, we've sent it a login link. Open it on this device.</p>
              ) : (
                <form onSubmit={handleEmailLogin} className="flex flex-col gap-2">
                  <label htmlFor="subscriber-email">The email you subscribe with</label>
                  <Input id="subscriber-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
                  <Button type="submit" disabled={status === 'sending'}>Email me a login link</Button>
                </form>
              )
            )}

            {subscriber.providers.includes('dev-code') && (
              <form onSubmit={handleCodeLogin} className="flex flex-col gap-2">
                <label htmlFor="subscriber-dev-code">Preview code</label>
                <Input id="subscriber-dev-code" type="password" required value={code} onChange={e => setCode(e.target.value)} />
                <Button type="submit" variant="outline" disabled={status === 'sending'}>Log in with code</Button>
              </form>
            )}

            {message && <p className="text-red-600">{message}</p>}

            <p className="text-xs">
              Not a subscriber? <a href={config.subscribeUrl} target="_blank" rel="noopener noreferrer" className="underline">Subscribe to {config.subscriptionName}</a>
            </p>
          </>
        )}
      </div>
    </ResponsiveDrawerOrDialog>
  );
}
