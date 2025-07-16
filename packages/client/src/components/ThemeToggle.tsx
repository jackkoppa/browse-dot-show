import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import {
  SwitchPrimitive,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@browse-dot-show/ui";
import './ThemeToggle.css';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  const handleThemeToggle = () => {
    toggleTheme();
  };

  // https://github.com/jnsahaj/tweakcn/blob/3ede03913eb68b65d264716c448dea50f8408dfb/components/editor/action-bar/components/theme-toggle.tsx#L19
  return (
    <div className="px-2">
      <Tooltip defaultOpen={false}>
        <TooltipTrigger>
          <SwitchPrimitive.Root
            checked={theme === "dark"}
            onClick={handleThemeToggle}
            className="peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=unchecked]:bg-input"
          >
            <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 flex items-center justify-center">
              {theme === "dark" ? (
                <Moon className="size-3" />
              ) : (
                <Sun className="size-3" />
              )}
            </SwitchPrimitive.Thumb>
          </SwitchPrimitive.Root>
        </TooltipTrigger>
        <TooltipContent>Toggle light/dark mode</TooltipContent>
      </Tooltip>
    </div>
  );
}