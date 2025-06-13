import { useEffect } from 'react';
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";
import { Badge } from './ui/badge';
import { trackEvent } from '../utils/goatcounter'
import { PodcastId } from '@browse-dot-show/types';
import siteConfig from '../config/site-config';

interface PlayTimeLimitDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  episodeTitle: string;
  formattedPublishedAt: string | null;
  podcastId: PodcastId;
}

export default function PlayTimeLimitDialog({
  isOpen,
  onOpenChange,
  episodeTitle,
  formattedPublishedAt,
  podcastId
}: PlayTimeLimitDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const handlePodcastLinkClick = () => {
    const podcastInfo = siteConfig.podcastLinks[podcastId];
    
    // Use a generic event type for now, with specific event name
    trackEvent({
      eventType: podcastId === 'football-cliches' ? 'Open In Podcast App Link Clicked [Football Cliches]' : 'Open In Podcast App Link Clicked [For Our Sins: The Cliches Pod Archive]',
      eventName: `Open In Podcast App Link Clicked [${podcastInfo?.title || 'Unknown Podcast'}]`
    })
    
    const linkToOpen = podcastInfo?.url;
    if (linkToOpen) {
      window.open(linkToOpen, '_blank');
    }
    onOpenChange(false);
  };

  const podcastInfo = siteConfig.podcastLinks[podcastId];

  const dialogDescription = (
    <>
      <span><em>{siteConfig.shortTitle}</em> sets a 5-minute listening limit <strong>per episode</strong>, per session.</span><br /><br />
      <span>We want <span className="underline" onClick={handlePodcastLinkClick}>{podcastInfo?.title || 'this podcast'}</span> to receive all its regular downloads & ad plays.<br />So to keep listening to this episode, please open in your podcast player of choice.</span>
    </>
  );

  useEffect(() => { 
    trackEvent({
      eventType: 'Play Time Limit Dialog Opened',
    });
  }, []);

  const dialogContent = (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <p className="mb-5">
          And of course, we still encourage happy hunting across other episodes here!
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center mt-1">
          {formattedPublishedAt && <Badge variant="destructive">{formattedPublishedAt}</Badge>}
          <span className="text-xs text-muted-foreground">{episodeTitle}</span>
        </div>
        <Button
          onClick={handlePodcastLinkClick}
          className="w-full"
        >
          Open in Podcast App
        </Button>
      </div>
    </div>
  );

  const continueBrowsingButtonText = 'Continue Searching Here';

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] font-mono bg-background text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl">Listening Limit Reached</DialogTitle>
            <DialogDescription>
              {dialogDescription}
            </DialogDescription>
          </DialogHeader>
          {dialogContent}

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            {continueBrowsingButtonText}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="font-mono bg-background text-foreground">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-xl">Listening Limit Reached</DrawerTitle>
          <DrawerDescription>
            {dialogDescription}
          </DrawerDescription>
        </DrawerHeader>
        <div className="p-4">
          {dialogContent}
        </div>
        <DrawerFooter className="pt-2">
          <DrawerClose asChild>
            <Button variant="outline" size="default">{continueBrowsingButtonText}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
} 