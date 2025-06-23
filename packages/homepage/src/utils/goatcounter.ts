import { log } from './logging';

/**
 * Disable if we're getting rate limited.
 */
const GOATCOUNTER_ENABLED = true;

interface GoatCounterEvent {
    eventType: 
        'Search Performed' | 
        'Share Link Copied' | 
        'Result Clicked' | 
        'Play Button Clicked' | 
        'Play Time Limit Dialog Opened' |
        'Open In Podcast App Link Clicked [Football Cliches]' |
        'Open In Podcast App Link Clicked [For Our Sins: The Cliches Pod Archive]';
    /** e.g. `Searched: 'football clubbing'`- when you want each event to be tracked separately, provide a unique eventName per-tracked-event. Otherwise, eventType is suffcient.  */
    eventName?: string;
}

/**
 * Instead of tracking page views throughout the SPA (e.g. when navigating between routes), 
 * we only care about a few events.
 * We do this using goatcounter, initialized in index.html.
 * 
 * DOCS: https://www.goatcounter.com/help/events
 */
export const trackEvent = ({ eventName, eventType }: GoatCounterEvent) => {
    if (!GOATCOUNTER_ENABLED) {
        return;
    }

    const goatcounter = (window as any).goatcounter;
    if (!goatcounter?.count) {
        log.debug(`
    Cannot find goatcounter script. Is it missing from index.html? 
    Would have sent event: ${eventName} with type: ${eventType}`);
        return;
    }

    // If no eventName was provided, then *both* title & path should be the same - path is what distinguishes uniquely-tracked events.
    eventName = eventName ?? eventType;

    // DOCS: https://www.goatcounter.com/help/events
    goatcounter.count({
        path: eventName,
        title: eventType,
        event: true,
    });
}
