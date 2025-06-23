import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import {
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@browse-dot-show/ui";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  const handleThemeToggle = () => {
    toggleTheme();
  };

  return (
    <div className="px-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">
            <Switch
              checked={theme === "dark"}
              onClick={handleThemeToggle}
              className="h-6 w-11"
            />
            <div className="absolute inset-0 flex items-center justify-start pl-0.5 pointer-events-none">
              <div className={`h-5 w-5 rounded-full bg-background shadow-lg transition-transform flex items-center justify-center ${theme === "dark" ? "translate-x-5" : "translate-x-0"}`}>
                {theme === "dark" ? (
                  <Moon className="size-3" />
                ) : (
                  <Sun className="size-3" />
                )}
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>Toggle light/dark mode</TooltipContent>
      </Tooltip>
    </div>
  );
}