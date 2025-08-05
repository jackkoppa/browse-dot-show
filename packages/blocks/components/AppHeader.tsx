import React, { useState } from 'react'

// Configuration interface for the AppHeader
export interface AppHeaderConfig {
  // Header text content
  title: {
    prefix?: string;
    main: string;
  };
  tagline?: {
    text: string;
    linkText?: string;
    linkUrl?: string;
    suffix?: string;
  };

  // Custom action buttons/content in header
  actions?: React.ReactNode;

  // Right-side content: theme toggle and/or image (mutually exclusive with actions)
  rightImageAndThemeToggle?: {
    themeToggle?: React.ReactNode;
    image?: {
      lowRes: string;
      highRes: string;
      altText: string;
    };
  };
}

export interface AppHeaderProps {
  scrolled: boolean;
  config: AppHeaderConfig;
}

// Progressive image loading component
function ProgressiveImage({ config, scrolled }: { config: NonNullable<AppHeaderConfig['rightImageAndThemeToggle']>['image'], scrolled: boolean }) {
  const [highResLoaded, setHighResLoaded] = useState(false);

  if (!config) return null;

  return (
    <span className={`relative block transition-all duration-200 ${scrolled ? 'w-8 h-8 xs:w-10 xs:h-10' : 'w-12 h-12 xs:w-16 xs:h-16'}`}>
      <img
        src={config.lowRes}
        alt={`${config.altText} (low-res)`}
        className="absolute inset-0 w-full h-full object-cover rounded-full"
        style={{
          opacity: highResLoaded ? 0 : 1,
          filter: "blur(2px)"
        }}
        draggable={false}
      />
      <img
        src={config.highRes}
        alt={config.altText}
        className="absolute inset-0 w-full h-full object-cover rounded-full"
        style={{
          opacity: highResLoaded ? 1 : 0,
        }}
        onLoad={() => setHighResLoaded(true)}
        draggable={false}
      />
    </span>
  );
}

export default function AppHeader({ scrolled, config }: AppHeaderProps) {
  // Validation: cannot have both actions and rightImageAndThemeToggle
  if (config.actions && config.rightImageAndThemeToggle) {
    throw new Error('AppHeader: Cannot provide both actions and rightImageAndThemeToggle. Please provide only one.');
  }

  /** Determines certain display ordering - whether the header has the `[browse.show]` prefix */
  const hasPrefix = config.title.prefix;

  return (
    <header className={`fixed text-foreground top-0 left-0 right-0 z-20 bg-transparent light:bg-browse-dot-show-theme-light dark:bg-browse-dot-show-theme-dark border-b-2 border-foreground shadow-[0px_4px_0px_rgba(0,0,0,1)]`}>
      <div className={`max-w-3xl mx-auto transition-all duration-400 ease-in-out ${scrolled ? 'py-1 xs:py-2' : 'py-2 sm:py-5'} px-3 sm:px-6`}>
        {/* Mobile: Multi-row layout, Desktop: Side-by-side */}
        <div className={`flex sm:justify-between sm:items-start gap-1 sm:gap-2 ${hasPrefix ? 'flex-col sm:flex-row' : 'flex-row'}`}>

          {/* Top Row on Mobile, if prefix is set: [browse.show] + Actions/Image */}
          {hasPrefix && <div className="flex justify-between items-center sm:hidden">
            {config.title.prefix && (
              <span className={`font-bold ${scrolled ? 'text-[12px]' : 'text-[18px]'}`}>
                {config.title.prefix}
              </span>
            )}
            {config.actions && (
              <div className={`flex flex-row items-center gap-1 ${scrolled ? 'hidden' : ''}`}>
                {config.actions}
              </div>
            )}
            {config.rightImageAndThemeToggle && (
              <div className={`flex flex-row items-center gap-2 ${scrolled ? 'hidden' : ''}`}>
                {config.rightImageAndThemeToggle.themeToggle}
                {config.rightImageAndThemeToggle.image && (
                  <ProgressiveImage config={config.rightImageAndThemeToggle.image} scrolled={scrolled} />
                )}
              </div>
            )}
          </div>}

          {/* Title Section - Main title always, prefix on desktop only */}
          <div className={`flex-1 sm:order-1 ${!hasPrefix ? 'content-center' : ''}`}>
            <h1 className={`font-bold transition-all duration-200 leading-tight ${scrolled ? 'text-xl xs:text-2xl mb-0' : 'text-2xl xs:text-3xl mb-1'}`}>
              {/* Desktop: Show prefix inline with title */}
              {config.title.prefix && (
                <span className={`font-bold hidden sm:inline ${scrolled ? 'text-[12px] xs:text-[18px]' : 'text-[18px] xs:text-lg'}`}>
                  {config.title.prefix}{' '}
                </span>
              )}
              <span className="font-thin">{config.title.main}</span>
            </h1>

            {/* Tagline */}
            {config.tagline && (
              <p className={`text-[12px] italic transition-all duration-200 mt-1 ${scrolled ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
                <span>{config.tagline.text} </span>
                {config.tagline.linkText && config.tagline.linkUrl && (
                  <a href={config.tagline.linkUrl} className="underline" target="_blank" rel="noopener noreferrer">
                    {config.tagline.linkText}
                  </a>
                )}
                {config.tagline.suffix && <span> {config.tagline.suffix}</span>}
              </p>
            )}
          </div>



          {/* Actions/Image - Desktop only (mobile handled above) */}
          {config.actions && (
            <div className={`hidden sm:flex flex-row items-center gap-3 sm:order-2 ${scrolled ? 'hidden sm:flex' : ''}`}>
              {config.actions}
            </div>
          )}

          {/* Actions/Image - Mobile, when no prefix is set */}
          {!hasPrefix && config.actions && (
            <div className={`flex flex-0 sm:hidden flex-col items-center gap-1 order-2 ${scrolled ? 'hidden' : ''}`}>
              {config.actions}
            </div>
          )}
          {!hasPrefix && config.rightImageAndThemeToggle && (
            <div className={`flex flex-0 flex-row items-center gap-2 order-2 ${scrolled ? 'hidden' : ''}`}>
              {config.rightImageAndThemeToggle.themeToggle}
              {config.rightImageAndThemeToggle.image && (
                <ProgressiveImage config={config.rightImageAndThemeToggle.image} scrolled={scrolled} />
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
} 