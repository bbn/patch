/**
 * Client-side database implementation using Firebase JS SDK
 */

import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  deleteDoc,
  DocumentData,
  QuerySnapshot
} from 'firebase/firestore';
import { db } from './firebase';
import { Database } from './database';

export class ClientDatabase implements Database {
  // Generic document operations
  async saveDocument(collection: string, id: string, data: any): Promise<void> {
    try {
      const docRef = doc(db, collection, id);
      await setDoc(docRef, data);
    } catch (error) {
      console.error(`Error saving to Firestore (${collection}/${id}):`, error);
      throw new Error(`Failed to save to Firestore: ${error}`);
    }
  }

  async getDocument<T>(collection: string, id: string): Promise<T | null> {
    try {
      const docRef = doc(db, collection, id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return null;
      }
      
      return docSnap.data() as T;
    } catch (error) {
      console.error(`Error getting from Firestore (${collection}/${id}):`, error);
      return null;
    }
  }

  async deleteDocument(collection: string, id: string): Promise<boolean> {
    try {
      const docRef = doc(db, collection, id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error(`Error deleting from Firestore (${collection}/${id}):`, error);
      return false;
    }
  }

  async getAllDocuments(collectionName: string): Promise<DocumentData[]> {
    try {
      const querySnapshot = await getDocs(collection(db, collectionName));
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(`Error listing documents from Firestore (${collectionName}):`, error);
      return [];
    }
  }

  // Convenience wrappers for patches
  async savePatch(id: string, data: any): Promise<void> {
    console.log(`[ClientDB] Saving patch ${id} directly to Firestore`);
    return this.saveDocument('patches', id, data);
  }

  async getPatch<T>(id: string): Promise<T | null> {
    console.log(`[ClientDB] Retrieving patch ${id} directly from Firestore`);
    return this.getDocument<T>('patches', id);
  }

  async deletePatch(id: string): Promise<boolean> {
    console.log(`[ClientDB] Deleting patch ${id} directly from Firestore`);
    return this.deleteDocument('patches', id);
  }

  async getAllPatches(): Promise<DocumentData[]> {
    console.log('[ClientDB] Retrieving all patches directly from Firestore');
    return this.getAllDocuments('patches');
  }

  // Convenience wrappers for gears
  async saveGear(id: string, data: any): Promise<void> {
    console.log(`[ClientDB] Saving gear ${id} directly to Firestore`);
    return this.saveDocument('gears', id, data);
  }

  async getGear<T>(id: string): Promise<T | null> {
    console.log(`[ClientDB] Retrieving gear ${id} directly from Firestore`);
    return this.getDocument<T>('gears', id);
  }

  async deleteGear(id: string): Promise<boolean> {
    console.log(`[ClientDB] Deleting gear ${id} directly from Firestore`);
    return this.deleteDocument('gears', id);
  }

  async getAllGears(): Promise<DocumentData[]> {
    console.log('[ClientDB] Retrieving all gears directly from Firestore');
    return this.getAllDocuments('gears');
  }
  
  // Helper function to convert Firebase QuerySnapshot to array
  querySnapshotToArray<T>(snapshot: QuerySnapshot): T[] {
    const result: T[] = [];
    snapshot.forEach(doc => {
      result.push({ id: doc.id, ...doc.data() } as T);
    });
    return result;
  }
}