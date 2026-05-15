import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="切换主题"
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-ink transition duration-300 hover:bg-[var(--color-surface-soft)]",
        "dark:border-[rgba(250,249,245,0.10)] dark:bg-[var(--color-surface-dark-elev)] dark:text-on-dark dark:hover:bg-[var(--color-surface-dark-soft)]",
      )}
    >
      <span className="relative h-4 w-4">
        <Sun
          strokeWidth={1.75}
          className={cn(
            "absolute inset-0 h-4 w-4 transition duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            isDark ? "rotate-0 opacity-100" : "rotate-90 opacity-0",
          )}
        />
        <Moon
          strokeWidth={1.75}
          className={cn(
            "absolute inset-0 h-4 w-4 transition duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            isDark ? "-rotate-90 opacity-0" : "rotate-0 opacity-100",
          )}
        />
      </span>
    </button>
  );
}
