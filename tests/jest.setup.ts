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

// Mock Firebase Admin SDK
jest.mock('@/lib/server/firebase-admin', () => {
  return {
    admin: {
      firestore: jest.fn(() => ({})),
      app: jest.fn(() => ({}))
    },
    adminDb: {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          set: jest.fn(() => Promise.resolve()),
          get: jest.fn(() => Promise.resolve({
            exists: true,
            data: () => ({})
          })),
          delete: jest.fn(() => Promise.resolve())
        })),
        where: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({
            docs: []
          }))
        })),
        get: jest.fn(() => Promise.resolve({
          docs: []
        }))
      }))
    },
    __esModule: true
  };
});

// Mock Firebase Admin Database
jest.mock('@/lib/server/admin-database', () => {
  return {
    saveGear: jest.fn((id, data) => {
      if (!mockStore.gears) mockStore.gears = {};
      mockStore.gears[id] = { ...data };
      return Promise.resolve();
    }),
    getGear: jest.fn((id) => {
      if (!mockStore.gears) return Promise.resolve(null);
      return Promise.resolve(mockStore.gears[id] || null);
    }),
    deleteGear: jest.fn((id) => {
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
    savePatch: jest.fn((id, data) => {
      if (!mockStore.patches) mockStore.patches = {};
      mockStore.patches[id] = { ...data };
      return Promise.resolve();
    }),
    getPatch: jest.fn((id) => {
      if (!mockStore.patches) return Promise.resolve(null);
      return Promise.resolve(mockStore.patches[id] || null);
    }),
    deletePatch: jest.fn((id) => {
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
    __esModule: true
  };
});

// Mock the database module to provide test implementations
jest.mock('@/lib/database', () => {
  // Create a mock database implementation based on our in-memory store
  const testDatabase = {
    saveGear: jest.fn((id, data) => {
      if (!mockStore.gears) mockStore.gears = {};
      mockStore.gears[id] = { ...data };
      return Promise.resolve();
    }),
    getGear: jest.fn((id) => {
      if (!mockStore.gears) return Promise.resolve(null);
      return Promise.resolve(mockStore.gears[id] || null);
    }),
    deleteGear: jest.fn((id) => {
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
    savePatch: jest.fn((id, data) => {
      if (!mockStore.patches) mockStore.patches = {};
      mockStore.patches[id] = { ...data };
      return Promise.resolve();
    }),
    getPatch: jest.fn((id) => {
      if (!mockStore.patches) return Promise.resolve(null);
      return Promise.resolve(mockStore.patches[id] || null);
    }),
    deletePatch: jest.fn((id) => {
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
    })
  };
  
  return {
    getDatabase: jest.fn(() => testDatabase),
    Database: jest.fn(),
    __esModule: true
  };
});

// Add global test mocking for fetch
// Use proper Response constructor to ensure TypeScript compatibility
const mockResponseText = 'Test response';
global.fetch = jest.fn().mockImplementation(() => {
  return Promise.resolve(
    new Response(
      JSON.stringify({ content: mockResponseText }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  );
});

// Set a global flag for LLM mocking based on jest command line
// This allows tests to check if they should use real or mock LLMs
declare global {
  namespace NodeJS {
    interface Global {
      MOCK_LLMS: boolean;
      fetch: Function;
    }
  }
}

(global as any).MOCK_LLMS = true;

// Mock the AI SDK with proper implementation
jest.mock('ai', () => {
  return {
    generateText: jest.fn().mockImplementation(() => Promise.resolve('Mocked AI response'))
  };
});

jest.mock('@ai-sdk/openai', () => {
  return {
    openai: jest.fn(() => ({
      modelId: 'gpt-4'
    }))
  };
});