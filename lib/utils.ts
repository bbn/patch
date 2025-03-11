import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Debug logging helper - controls verbose logging throughout the application
// Can be controlled via environment variable (DEBUG_LOGGING=true)
export function isDebugLoggingEnabled(): boolean {
  return process.env.DEBUG_LOGGING === 'true';
}

// Conditional logging function - only logs if debug mode is enabled
export function debugLog(context: string, ...args: any[]): void {
  if (isDebugLoggingEnabled()) {
    console.log(`[DEBUG:${context}]`, ...args);
  }
}