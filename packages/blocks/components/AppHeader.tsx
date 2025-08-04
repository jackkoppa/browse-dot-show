import React from 'react'

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
}

export interface AppHeaderProps {
  scrolled: boolean;
  config: AppHeaderConfig;
}

export default function AppHeader({ scrolled, config }: AppHeaderProps) {
  /** Determines certain display ordering - whether the header has the `[browse.show]` prefix */
  const hasPrefix = config.title.prefix;

  return (
    <header className={`fixed text-foreground top-0 left-0 right-0 z-20 bg-transparent light:bg-browse-dot-show-theme-light dark:bg-browse-dot-show-theme-dark border-b-2 border-foreground shadow-[0px_4px_0px_rgba(0,0,0,1)]`}>
      <div className={`max-w-3xl mx-auto transition-all duration-400 ease-in-out ${scrolled ? 'py-1 xs:py-2' : 'py-2 sm:py-5'} px-3 sm:px-6`}>
        {/* Mobile: Multi-row layout, Desktop: Side-by-side */}
        <div className={`flex sm:justify-between sm:items-start gap-1 sm:gap-2 ${hasPrefix ? 'flex-col sm:flex-row' : 'flex-row'}`}>

          {/* Top Row on Mobile, if prefix is set: [browse.show] + Actions */}
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
          </div>}

          {/* Title Section - Main title always, prefix on desktop only */}
          <div className={`flex-1 sm:order-1 ${hasPrefix ? 'content-center' : ''}`}>
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



          {/* Actions - Desktop only (mobile handled above) */}
          {config.actions && (
            <div className={`hidden sm:flex flex-row items-center gap-3 sm:order-2 ${scrolled ? 'hidden sm:flex' : ''}`}>
              {config.actions}
            </div>
          )}
          {/* Actions - Mobile, when no prefix is set */}
          {!hasPrefix && config.actions && (
            <div className={`flex flex-0 sm:hidden flex-col items-center gap-1 order-2 ${scrolled ? 'hidden' : ''}`}>
              {config.actions}
            </div>
          )}
        </div>
      </div>
    </header>
  );
} 