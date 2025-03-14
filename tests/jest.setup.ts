// Mock Firebase Firestore for testing
import { DocumentData } from 'firebase/firestore';

// Create an in-memory store for testing
const mockStore: Record<string, Record<string, any>> = {
  patches: {},
  gears: {}
};

// Mock the Firestore functions
jest.mock('@/lib/firestore', () => ({
  // Patch collection operations
  savePatch: jest.fn((id: string, data: any) => {
    if (!mockStore.patches) mockStore.patches = {};
    mockStore.patches[id] = { ...data };
    return Promise.resolve();
  }),
  
  getPatch: jest.fn((id: string) => {
    if (!mockStore.patches) return Promise.resolve(null);
    return Promise.resolve(mockStore.patches[id] || null);
  }),
  
  deletePatch: jest.fn((id: string) => {
    if (!mockStore.patches) return Promise.resolve(false);
    if (id in mockStore.patches) {
      delete mockStore.patches[id];
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }),
  
  getAllPatches: jest.fn(() => {
    if (!mockStore.patches) return Promise.resolve([]);
    return Promise.resolve(
      Object.entries(mockStore.patches).map(([id, data]) => ({ id, ...data }))
    );
  }),
  
  // Gear collection operations
  saveGear: jest.fn((id: string, data: any) => {
    if (!mockStore.gears) mockStore.gears = {};
    mockStore.gears[id] = { ...data };
    return Promise.resolve();
  }),
  
  getGear: jest.fn((id: string) => {
    if (!mockStore.gears) return Promise.resolve(null);
    return Promise.resolve(mockStore.gears[id] || null);
  }),
  
  deleteGear: jest.fn((id: string) => {
    if (!mockStore.gears) return Promise.resolve(false);
    if (id in mockStore.gears) {
      delete mockStore.gears[id];
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }),
  
  getAllGears: jest.fn(() => {
    if (!mockStore.gears) return Promise.resolve([]);
    return Promise.resolve(
      Object.entries(mockStore.gears).map(([id, data]) => ({ id, ...data }))
    );
  }),
  
  querySnapshotToArray: jest.fn((snapshot: any) => {
    return [];
  }),
  
  __esModule: true,
}));

// Also mock the old KV functions for backward compatibility in tests
jest.mock('@/lib/kv', () => {
  return {
    saveToKV: jest.fn((key: string, data: any) => {
      if (key.startsWith('patch:')) {
        const id = key.replace('patch:', '');
        if (!mockStore.patches) mockStore.patches = {};
        mockStore.patches[id] = data;
      } else if (key.startsWith('gear:')) {
        const id = key.replace('gear:', '');
        if (!mockStore.gears) mockStore.gears = {};
        mockStore.gears[id] = data;
      }
      return Promise.resolve();
    }),
    
    getFromKV: jest.fn((key: string) => {
      if (key.startsWith('patch:')) {
        const id = key.replace('patch:', '');
        if (!mockStore.patches) return Promise.resolve(null);
        return Promise.resolve(mockStore.patches[id] || null);
      } else if (key.startsWith('gear:')) {
        const id = key.replace('gear:', '');
        if (!mockStore.gears) return Promise.resolve(null);
        return Promise.resolve(mockStore.gears[id] || null);
      }
      return Promise.resolve(null);
    }),
    
    deleteFromKV: jest.fn((key: string) => {
      if (key.startsWith('patch:')) {
        const id = key.replace('patch:', '');
        if (!mockStore.patches) return Promise.resolve(true);
        if (id in mockStore.patches) {
          delete mockStore.patches[id];
        }
      } else if (key.startsWith('gear:')) {
        const id = key.replace('gear:', '');
        if (!mockStore.gears) return Promise.resolve(true);
        if (id in mockStore.gears) {
          delete mockStore.gears[id];
        }
      }
      return Promise.resolve(true);
    }),
    
    listKeysFromKV: jest.fn((pattern: string) => {
      if (pattern === 'patch:*') {
        if (!mockStore.patches) return Promise.resolve([]);
        return Promise.resolve(
          Object.keys(mockStore.patches).map(id => `patch:${id}`)
        );
      } else if (pattern === 'gear:*') {
        if (!mockStore.gears) return Promise.resolve([]);
        return Promise.resolve(
          Object.keys(mockStore.gears).map(id => `gear:${id}`)
        );
      }
      return Promise.resolve([]);
    }),
    
    __esModule: true,
  };
});

// Mock Firebase
jest.mock('firebase/firestore', () => {
  return {
    collection: jest.fn(() => ({})),
    doc: jest.fn(() => ({})),
    setDoc: jest.fn(() => Promise.resolve()),
    getDoc: jest.fn(() => Promise.resolve({
      exists: () => true,
      data: () => ({})
    })),
    getDocs: jest.fn(() => Promise.resolve({
      docs: []
    })),
    deleteDoc: jest.fn(() => Promise.resolve()),
    query: jest.fn(() => ({})),
    where: jest.fn(() => ({})),
    onSnapshot: jest.fn(() => () => {}),
    DocumentData: function() {},
    __esModule: true,
  };
});

jest.mock('@/lib/firebase', () => {
  return {
    db: {},
    __esModule: true,
  };
});