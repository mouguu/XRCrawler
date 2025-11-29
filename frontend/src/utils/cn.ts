import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind-aware className merge helper.
 * Extracted from App.tsx to make it reusable across components.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

