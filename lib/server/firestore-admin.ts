import { adminDb } from './firebase-admin';
import { DocumentData } from 'firebase-admin/firestore';

/**
 * SERVER-SIDE ONLY FUNCTIONS FOR FIRESTORE
 * These functions should never be imported in client components.
 */

// PATCH COLLECTION OPERATIONS

/**
 * Save a document to the 'patches' collection (server-side only)
 */
export async function savePatchAdmin(id: string, data: any): Promise<void> {
  if (!data) {
    throw new Error('Cannot save null or undefined data to Firestore');
  }
  
  try {
    await adminDb.collection('patches').doc(id).set(data);
  } catch (error) {
    console.error(`Error saving to Firestore (patches/${id}):`, error);
    throw new Error(`Failed to save to Firestore: ${error}`);
  }
}

/**
 * Get a document from the 'patches' collection (server-side only)
 */
export async function getPatchAdmin<T>(id: string): Promise<T | null> {
  try {
    const doc = await adminDb.collection('patches').doc(id).get();
    
    if (!doc.exists) {
      return null;
    }
    
    return doc.data() as T;
  } catch (error) {
    console.error(`Error getting from Firestore (patches/${id}):`, error);
    return null;
  }
}

/**
 * Delete a document from the 'patches' collection (server-side only)
 */
export async function deletePatchAdmin(id: string): Promise<boolean> {
  try {
    await adminDb.collection('patches').doc(id).delete();
    return true;
  } catch (error) {
    console.error(`Error deleting from Firestore (patches/${id}):`, error);
    return false;
  }
}

/**
 * Get all documents from the 'patches' collection (server-side only)
 */
export async function getAllPatchesAdmin(): Promise<DocumentData[]> {
  try {
    const snapshot = await adminDb.collection('patches').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error(`Error listing patches from Firestore:`, error);
    return [];
  }
}

// GEAR COLLECTION OPERATIONS

/**
 * Save a document to the 'gears' collection (server-side only)
 */
export async function saveGearAdmin(id: string, data: any): Promise<void> {
  if (!data) {
    throw new Error('Cannot save null or undefined data to Firestore');
  }
  
  try {
    await adminDb.collection('gears').doc(id).set(data);
  } catch (error) {
    console.error(`Error saving to Firestore (gears/${id}):`, error);
    throw new Error(`Failed to save to Firestore: ${error}`);
  }
}

/**
 * Get a document from the 'gears' collection (server-side only)
 */
export async function getGearAdmin<T>(id: string): Promise<T | null> {
  try {
    const doc = await adminDb.collection('gears').doc(id).get();
    
    if (!doc.exists) {
      return null;
    }
    
    return doc.data() as T;
  } catch (error) {
    console.error(`Error getting from Firestore (gears/${id}):`, error);
    return null;
  }
}

/**
 * Delete a document from the 'gears' collection (server-side only)
 */
export async function deleteGearAdmin(id: string): Promise<boolean> {
  try {
    await adminDb.collection('gears').doc(id).delete();
    return true;
  } catch (error) {
    console.error(`Error deleting from Firestore (gears/${id}):`, error);
    return false;
  }
}

/**
 * Get all documents from the 'gears' collection (server-side only)
 */
export async function getAllGearsAdmin(): Promise<DocumentData[]> {
  try {
    const snapshot = await adminDb.collection('gears').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error(`Error listing gears from Firestore:`, error);
    return [];
  }
}

// Helper function to convert Firebase Admin QuerySnapshot to array
export function adminQuerySnapshotToArray<T>(snapshot: any): T[] {
  const result: T[] = [];
  snapshot.forEach((doc: any) => {
    result.push({ id: doc.id, ...doc.data() } as T);
  });
  return result;
}