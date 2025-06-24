import { AppHeader as SharedAppHeader, AppHeaderConfig } from '@browse-dot-show/blocks'

interface AppHeaderProps {
  scrolled: boolean;
}

export default function AppHeader({ scrolled }: AppHeaderProps) {
  const config: AppHeaderConfig = {
    title: {
      main: 'Browse Dot Show'
    },
    tagline: {
      text: 'Search the',
      linkText: 'Unknown',
      linkUrl: '#',
      suffix: 'podcast archives'
    }
    // No actions for homepage - will be replaced with different content later
  };

  return <SharedAppHeader scrolled={scrolled} config={config} />;
} 