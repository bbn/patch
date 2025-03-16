/**
 * Abstract database interface to unify client-side and server-side Firestore operations
 * This allows model classes to use a single API regardless of environment
 */

import { DocumentData } from 'firebase/firestore';

// Define the common database interface
export interface Database {
  // Generic document operations
  saveDocument(collection: string, id: string, data: any): Promise<void>;
  getDocument<T>(collection: string, id: string): Promise<T | null>;
  deleteDocument(collection: string, id: string): Promise<boolean>;
  getAllDocuments(collection: string): Promise<DocumentData[]>;
  
  // Convenience wrappers for common collections
  savePatch(id: string, data: any): Promise<void>;
  getPatch<T>(id: string): Promise<T | null>;
  deletePatch(id: string): Promise<boolean>;
  getAllPatches(): Promise<DocumentData[]>;
  
  saveGear(id: string, data: any): Promise<void>;
  getGear<T>(id: string): Promise<T | null>;
  deleteGear(id: string): Promise<boolean>;
  getAllGears(): Promise<DocumentData[]>;
}

// Factory function to get the appropriate database implementation
// Will be imported by model classes
export function getDatabase(): Database {
  if (typeof window === 'undefined') {
    // Server-side: use Admin SDK
    const { AdminDatabase } = require('./server/admin-database');
    return new AdminDatabase();
  } else {
    // Client-side: use client SDK
    const { ClientDatabase } = require('./client-database');
    return new ClientDatabase();
  }
}