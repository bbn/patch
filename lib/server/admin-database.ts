/**
 * Server-side database implementation using Firebase Admin SDK
 */

import { adminDb } from './firebase-admin';
import { DocumentData } from 'firebase-admin/firestore';
import { Database } from '../database';

export class AdminDatabase implements Database {
  // Generic document operations
  async saveDocument(collection: string, id: string, data: any): Promise<void> {
    if (!data) {
      throw new Error('Cannot save null or undefined data to Firestore');
    }
    
    try {
      await adminDb.collection(collection).doc(id).set(data);
    } catch (error) {
      console.error(`Error saving to Firestore (${collection}/${id}):`, error);
      throw new Error(`Failed to save to Firestore: ${error}`);
    }
  }

  async getDocument<T>(collection: string, id: string): Promise<T | null> {
    try {
      const doc = await adminDb.collection(collection).doc(id).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return doc.data() as T;
    } catch (error) {
      console.error(`Error getting from Firestore (${collection}/${id}):`, error);
      return null;
    }
  }

  async deleteDocument(collection: string, id: string): Promise<boolean> {
    try {
      await adminDb.collection(collection).doc(id).delete();
      return true;
    } catch (error) {
      console.error(`Error deleting from Firestore (${collection}/${id}):`, error);
      return false;
    }
  }

  async getAllDocuments(collectionName: string): Promise<DocumentData[]> {
    try {
      const snapshot = await adminDb.collection(collectionName).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(`Error listing documents from Firestore (${collectionName}):`, error);
      return [];
    }
  }

  // Convenience wrappers for patches
  async savePatch(id: string, data: any): Promise<void> {
    console.log(`[AdminDB] Saving patch ${id} to Firestore (server-side)`);
    return this.saveDocument('patches', id, data);
  }

  async getPatch<T>(id: string): Promise<T | null> {
    console.log(`[AdminDB] Retrieving patch ${id} from Firestore (server-side)`);
    return this.getDocument<T>('patches', id);
  }

  async deletePatch(id: string): Promise<boolean> {
    console.log(`[AdminDB] Deleting patch ${id} from Firestore (server-side)`);
    return this.deleteDocument('patches', id);
  }

  async getAllPatches(): Promise<DocumentData[]> {
    console.log('[AdminDB] Retrieving all patches from Firestore (server-side)');
    return this.getAllDocuments('patches');
  }

  // Convenience wrappers for gears
  async saveGear(id: string, data: any): Promise<void> {
    console.log(`[AdminDB] Saving gear ${id} to Firestore (server-side)`);
    return this.saveDocument('gears', id, data);
  }

  async getGear<T>(id: string): Promise<T | null> {
    console.log(`[AdminDB] Retrieving gear ${id} from Firestore (server-side)`);
    return this.getDocument<T>('gears', id);
  }

  async deleteGear(id: string): Promise<boolean> {
    console.log(`[AdminDB] Deleting gear ${id} from Firestore (server-side)`);
    return this.deleteDocument('gears', id);
  }

  async getAllGears(): Promise<DocumentData[]> {
    console.log('[AdminDB] Retrieving all gears from Firestore (server-side)');
    return this.getAllDocuments('gears');
  }
  
  // Helper function to convert Firebase Admin QuerySnapshot to array
  adminQuerySnapshotToArray<T>(snapshot: any): T[] {
    const result: T[] = [];
    snapshot.forEach((doc: any) => {
      result.push({ id: doc.id, ...doc.data() } as T);
    });
    return result;
  }
}