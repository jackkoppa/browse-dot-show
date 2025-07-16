import { log } from './logging';

import siteConfig from '@/config/site-config'

/**
 * Disable if we're getting rate limited. Has not been necessary yet.
 */
const GOATCOUNTER_ENABLED = true;

interface GoatCounterEvent {
    eventType: 
        'Search Performed' | 
        'Share Link Copied' | 
        'Result Clicked' | 
        'Play Button Clicked' | 
        'Play Time Limit Dialog Opened' |
        'Open In Podcast App Link Clicked' |
        'Contact Button Clicked' |
        'browse.show Info Link Clicked';
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
    // Don't attempt to track if goatcounter is disabled, or if the tracking script is not present
    if (!GOATCOUNTER_ENABLED || !siteConfig.trackingScript) {
        return;
    }

    const goatcounter = (window as any).goatcounter;
    if (!goatcounter?.count) {
        log.debug(`
    Cannot find goatcounter script. Is it missing from index.html? 
    Would have sent event: ${eventName} with type: ${eventType}`);
        return;
    }
    
    const title = `[${siteConfig.id}] ${eventType}`;

    /**
     * If no eventName was provided, then *both* title & path should be the same - path is what distinguishes uniquely-tracked events.
     * For path - the more visible + unique identifier, we put siteConfig.id _after_ eventName
     * 
     * @example `Searched: 'Hat GPT' [hardfork]`
     * @example `/ [claretandblue]`
     */
    const path = eventName ? `${eventName} [${siteConfig.id}]` : title;

    // DOCS: https://www.goatcounter.com/help/events
    goatcounter.count({
        path,
        title,
        event: true,
    });
}
