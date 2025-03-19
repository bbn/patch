import { Gear } from '@/lib/models/gear';
import { Patch } from '@/lib/models/patch';

// We'll use Jest's mocking capabilities to avoid actual API calls
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(),
}));

describe('Gear Connection in ReactFlow', () => {
  let gearA: Gear;
  let gearB: Gear;
  let patch: Patch;
  
  // Mock fetch before all tests
  let originalFetch: typeof global.fetch;
  
  beforeAll(() => {
    // Save original fetch
    originalFetch = global.fetch;
    // Mock fetch
    global.fetch = jest.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({}),
        text: async () => '',
      } as unknown as Response;
    });
  });
  
  afterAll(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });
  
  beforeEach(async () => {
    // Create two gears for testing
    gearA = new Gear({
      id: 'test-gear-a',
      outputUrls: []
    });
    
    gearB = new Gear({
      id: 'test-gear-b',
      outputUrls: []
    });
    
    // Create a patch
    patch = new Patch({
      id: 'test-patch',
      name: 'Test Patch',
      nodes: [
        {
          id: 'node-a',
          type: 'gearNode',
          position: { x: 100, y: 100 },
          data: {
            gearId: 'test-gear-a',
            label: 'Gear A'
          }
        },
        {
          id: 'node-b',
          type: 'gearNode',
          position: { x: 300, y: 100 },
          data: {
            gearId: 'test-gear-b',
            label: 'Gear B'
          }
        }
      ],
      edges: []
    });
    
    // Mock the Gear.findById method
    jest.spyOn(Gear, 'findById').mockImplementation(async (id: string) => {
      if (id === 'test-gear-a') return gearA;
      if (id === 'test-gear-b') return gearB;
      return null;
    });
    
    // Mock the Patch.findById method
    jest.spyOn(Patch, 'findById').mockImplementation(async (id: string) => {
      if (id === 'test-patch') return patch;
      return null;
    });
    
    // Spy on the addOutputUrl method
    jest.spyOn(gearA, 'addOutputUrl');
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  test('when a connection is made in ReactFlow, source gear adds target gear URL to outputUrls', async () => {
    // Simulate adding an edge in ReactFlow by calling patch.addEdge
    const edge = {
      id: 'edge-a-b',
      source: 'node-a',
      target: 'node-b'
    };
    
    await patch.addEdge(edge);
    
    // Verify the addOutputUrl method was called with the expected URL
    // The method is called with (url, skipSave) where skipSave is optional
    const expectedUrl = '/api/gears/test-gear-b';
    expect(gearA.addOutputUrl).toHaveBeenCalled();
    // Pass the expected URL directly, and match the first argument only
    expect(gearA.addOutputUrl).toHaveBeenCalledWith(expectedUrl, expect.anything());
    
    // Verify the outputUrls array contains the expected URL
    expect(gearA.outputUrls).toContain(expectedUrl);
  });
});