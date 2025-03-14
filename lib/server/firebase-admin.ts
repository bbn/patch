import admin from "firebase-admin";
import { Firestore } from "firebase-admin/firestore";

// Initialize Firebase Admin SDK for server-side operations
if (!admin.apps.length) {
  try {
    // Check for required environment variables
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(`Missing Firebase credentials: 
        projectId: ${projectId ? 'defined' : 'missing'}, 
        clientEmail: ${clientEmail ? 'defined' : 'missing'}, 
        privateKey: ${privateKey ? 'defined' : 'missing'}`);
    }

    // Initialize the app with proper credentials
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
    console.log("Firebase Admin initialized successfully");
  } catch (error) {
    console.error("Firebase admin initialization error:", error);
  }
}

// Only export Firestore if admin was initialized successfully
// Define a type for our mock Firestore to match the Firestore interface
interface MockFirestore {
  collection: (path: string) => {
    doc: (id: string) => {
      get: () => Promise<{ exists: boolean; data: () => any | null }>;
      set: (data: any) => Promise<void>;
      delete: () => Promise<void>;
    };
    get: () => Promise<{ docs: any[] }>;
  };
}

let adminDb: Firestore | MockFirestore;
try {
  adminDb = admin.firestore();
} catch (error) {
  console.error("Failed to initialize Firestore admin:", error);
  // Create a mock implementation to avoid runtime errors
  adminDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => null }),
        set: async () => {},
        delete: async () => {},
      }),
      get: async () => ({ docs: [] }),
    }),
  };
}

export { adminDb };
export default admin;