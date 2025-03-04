import { kv } from '@vercel/kv';

// Export the KV instance for use across the application (server-side only)
export default kv;

// Helper functions for working with KV (server-side only)
export async function saveToKV(key: string, data: any): Promise<void> {
  try {
    await kv.set(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error saving to KV (${key}):`, error);
    throw new Error(`Failed to save to KV: ${error}`);
  }
}

export async function getFromKV<T>(key: string): Promise<T | null> {
  try {
    const data = await kv.get(key);
    if (!data) return null;
    
    return typeof data === 'string' ? JSON.parse(data) as T : data as T;
  } catch (error) {
    console.error(`Error getting from KV (${key}):`, error);
    return null;
  }
}

export async function deleteFromKV(key: string): Promise<boolean> {
  try {
    await kv.del(key);
    return true;
  } catch (error) {
    console.error(`Error deleting from KV (${key}):`, error);
    return false;
  }
}

export async function listKeysFromKV(pattern: string): Promise<string[]> {
  try {
    return await kv.keys(pattern);
  } catch (error) {
    console.error(`Error listing keys from KV (${pattern}):`, error);
    return [];
  }
}