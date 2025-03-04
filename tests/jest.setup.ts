// Mock the KV functions for testing
jest.mock('@/lib/kv', () => {
  // Create an in-memory store for testing
  const mockStore: Record<string, string> = {};
  
  return {
    saveToKV: jest.fn((key: string, data: any) => {
      mockStore[key] = JSON.stringify(data);
      return Promise.resolve();
    }),
    getFromKV: jest.fn((key: string) => {
      const data = mockStore[key];
      return Promise.resolve(data ? JSON.parse(data) : null);
    }),
    deleteFromKV: jest.fn((key: string) => {
      delete mockStore[key];
      return Promise.resolve(true);
    }),
    listKeysFromKV: jest.fn((pattern: string) => {
      // Simple pattern matching (just supporting * at the end)
      const basePattern = pattern.replace('*', '');
      return Promise.resolve(
        Object.keys(mockStore).filter(key => key.startsWith(basePattern))
      );
    }),
    __esModule: true,
  };
});