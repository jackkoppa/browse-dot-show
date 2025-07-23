import { log } from './logging';

/**
 * Disable if we're getting rate limited.
 */
const GOATCOUNTER_ENABLED = true;

interface GoatCounterEvent {
    /** Unique identifier for the event - any event with the same eventType will be counted towards the same event */
    eventType: 
        'Request Podcast Button Clicked' |
        'Self-Host Guide Button Clicked' | 
        any; // Allow any, for dynamic event types

    /** Optional category for the event - eventType is what distinguishes uniquely-tracked events. */
    eventName?: string;
}

/**
 * Instead of tracking page views throughout the SPA (e.g. when navigating between routes), 
 * we only care about a few events.
 * We do this using goatcounter, initialized in index.html.
 * 
 * DOCS: https://www.goatcounter.com/help/events
 */
export const trackEvent = ({ eventType, eventName }: GoatCounterEvent) => {
    if (!GOATCOUNTER_ENABLED) {
        return;
    }

    /** `path` is the value that determines distinct events. */
    const path = eventType;

    /** `title` is the value that additional info added to the goatcounter dashboard, not used in determining distinct events. */
    const title = eventName ?? eventType;

    const goatcounter = (window as any).goatcounter;
    if (!goatcounter?.count) {
        log.debug(`
    Cannot find goatcounter script. Is it missing from index.html? 
    Would have sent event: ${path} with type: ${title}`);
        return;
    }

    // DOCS: https://www.goatcounter.com/help/events
    goatcounter.count({
        path,
        title,
        event: true,
    });
}
