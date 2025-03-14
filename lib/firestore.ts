import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  deleteDoc, 
  query, 
  where,
  DocumentData,
  QuerySnapshot
} from 'firebase/firestore';
import { db } from './firebase';

// PATCH COLLECTION OPERATIONS

/**
 * Save a document to the 'patches' collection
 */
export async function savePatch(id: string, data: any): Promise<void> {
  try {
    const docRef = doc(db, 'patches', id);
    await setDoc(docRef, data);
  } catch (error) {
    console.error(`Error saving to Firestore (patches/${id}):`, error);
    throw new Error(`Failed to save to Firestore: ${error}`);
  }
}

/**
 * Get a document from the 'patches' collection
 */
export async function getPatch<T>(id: string): Promise<T | null> {
  try {
    const docRef = doc(db, 'patches', id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return docSnap.data() as T;
  } catch (error) {
    console.error(`Error getting from Firestore (patches/${id}):`, error);
    return null;
  }
}

/**
 * Delete a document from the 'patches' collection
 */
export async function deletePatch(id: string): Promise<boolean> {
  try {
    const docRef = doc(db, 'patches', id);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error(`Error deleting from Firestore (patches/${id}):`, error);
    return false;
  }
}

/**
 * Get all documents from the 'patches' collection
 */
export async function getAllPatches(): Promise<DocumentData[]> {
  try {
    const querySnapshot = await getDocs(collection(db, 'patches'));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error(`Error listing patches from Firestore:`, error);
    return [];
  }
}

// GEAR COLLECTION OPERATIONS

/**
 * Save a document to the 'gears' collection
 */
export async function saveGear(id: string, data: any): Promise<void> {
  try {
    const docRef = doc(db, 'gears', id);
    await setDoc(docRef, data);
  } catch (error) {
    console.error(`Error saving to Firestore (gears/${id}):`, error);
    throw new Error(`Failed to save to Firestore: ${error}`);
  }
}

/**
 * Get a document from the 'gears' collection
 */
export async function getGear<T>(id: string): Promise<T | null> {
  try {
    const docRef = doc(db, 'gears', id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return docSnap.data() as T;
  } catch (error) {
    console.error(`Error getting from Firestore (gears/${id}):`, error);
    return null;
  }
}

/**
 * Delete a document from the 'gears' collection
 */
export async function deleteGear(id: string): Promise<boolean> {
  try {
    const docRef = doc(db, 'gears', id);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error(`Error deleting from Firestore (gears/${id}):`, error);
    return false;
  }
}

/**
 * Get all documents from the 'gears' collection
 */
export async function getAllGears(): Promise<DocumentData[]> {
  try {
    const querySnapshot = await getDocs(collection(db, 'gears'));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error(`Error listing gears from Firestore:`, error);
    return [];
  }
}

// Helper function to convert Firebase QuerySnapshot to array
export function querySnapshotToArray<T>(snapshot: QuerySnapshot): T[] {
  const result: T[] = [];
  snapshot.forEach(doc => {
    result.push({ id: doc.id, ...doc.data() } as T);
  });
  return result;
}