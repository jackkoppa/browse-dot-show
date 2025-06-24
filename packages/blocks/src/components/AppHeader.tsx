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
  return (
    <header className={`fixed text-foreground top-0 left-0 right-0 z-20 bg-transparent light:bg-browse-dot-show-theme-light dark:bg-browse-dot-show-theme-dark border-b-2 border-foreground shadow-[0px_4px_0px_rgba(0,0,0,1)]`}>
      <div className={`max-w-3xl mx-auto pr-3 pl-6 flex justify-end gap-2 sm:gap-4 transition-all duration-400 ease-in-out ${scrolled ? 'py-1 xs:py-2' : 'py-2 sm:py-5'}`}>
        <div className="flex flex-col justify-center text-right">
          <h1 className={`font-bold transition-all duration-200 ${scrolled ? 'text-xl xs:text-2xl mb-0' : 'text-2xl xs:text-3xl mb-1'}`}>
            {config.title.prefix && (
              <span className={`font-bold ${scrolled ? 'text-[12px] xs:text-[18px]' : 'text-[18px] xs:text-lg'}`}>
                {config.title.prefix}{' '}
              </span>
            )}
            <span className="font-thin">{config.title.main}</span>
          </h1>
          {config.tagline && (
            <p className={`text-[12px] italic transition-all duration-200 ${scrolled ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
              <span>{config.tagline.text} </span>
              {config.tagline.linkText && config.tagline.linkUrl && (
                <a href={config.tagline.linkUrl} className="underline" target="_blank" rel="noopener noreferrer">
                  {config.tagline.linkText}
                </a>
              )}
              <br className="xs:hidden" />
              {config.tagline.suffix && <span> {config.tagline.suffix}</span>}
            </p>
          )}
        </div>
        
        {/* Custom actions */}
        {config.actions && (
          <div className={`flex flex-col items-center gap-1 sm:flex-row sm:gap-3 ${scrolled ? 'hidden sm:flex' : ''}`}>
            {config.actions}
          </div>
        )}
      </div>
    </header>
  );
} 