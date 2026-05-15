/**
 * 8-spike radial mark — used as the wordmark prefix and
 * inline as a content marker across the editorial layout.
 */
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("inline-block", className)}
      fill="currentColor"
    >
      <path d="M12 1.5l1.5 7.2L20.5 7l-5.4 5.1 5.4 5.1-7-1.7L12 22.5l-1.5-7.2L3.5 17l5.4-5.1-5.4-5.1 7 1.7L12 1.5z" />
    </svg>
  );
}
