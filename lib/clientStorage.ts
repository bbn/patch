// Client-side storage helper functions (for browser only)

/**
 * Saves data to localStorage with error handling
 */
export function saveToLocalStorage(key: string, data: any): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(`Error saving to localStorage (${key}):`, error);
    return false;
  }
}

/**
 * Gets data from localStorage with error handling
 */
export function getFromLocalStorage<T>(key: string): T | null {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) as T : null;
  } catch (error) {
    console.error(`Error getting from localStorage (${key}):`, error);
    return null;
  }
}

/**
 * Removes data from localStorage with error handling
 */
export function removeFromLocalStorage(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Error removing from localStorage (${key}):`, error);
    return false;
  }
}

/**
 * Lists all keys in localStorage that match a prefix
 */
export function listLocalStorageKeys(prefix: string): string[] {
  try {
    return Object.keys(localStorage)
      .filter(key => key.startsWith(prefix));
  } catch (error) {
    console.error(`Error listing localStorage keys:`, error);
    return [];
  }
}