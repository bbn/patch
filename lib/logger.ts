/**
 * Centralized logging utility for standardized logging across the application
 */

/**
 * Log an error message with optional error object
 * @param context The context where the error occurred (component, function name)
 * @param message Description of the error
 * @param error Optional error object
 */
export function logError(context: string, message: string, error?: any) {
  console.error(`[${context}] ${message}`, error);
}

/**
 * Log an informational message
 * @param context The context where the log is from
 * @param message Information to log
 */
export function logInfo(context: string, message: string) {
  console.info(`[${context}] ${message}`);
}

/**
 * Log a warning message
 * @param context The context where the warning occurred
 * @param message Warning information
 */
export function logWarning(context: string, message: string) {
  console.warn(`[${context}] ${message}`);
}

/**
 * Log debug information (only in development)
 * @param context The context where the debug info is from
 * @param message Debug information
 * @param data Optional data to log
 */
export function logDebug(context: string, message: string, data?: any) {
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[${context}] ${message}`, data);
  }
}