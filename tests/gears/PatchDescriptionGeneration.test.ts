import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Patch } from '@/lib/models/patch';
import { Gear } from '@/lib/models/gear';

// Mock the Gear and fetch
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(),
}));

// We'll mock the generateDescription method directly instead of mocking the AI SDK

describe('Patch Description Generation', () => {
  let testGear: Gear;
  let testPatch: Patch;
  
  // Mock fetch
  let originalFetch: typeof global.fetch;
  
  beforeAll(() => {
    // Save original fetch
    originalFetch = global.fetch;
    // Use the global mock fetch from jest.setup.ts
  });
  
  afterAll(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });
  
  beforeEach(async () => {
    // Create a test gear
    testGear = new Gear({
      id: 'test-description-gear',
      label: 'Test Processor',
      messages: [
        { role: 'system', content: 'You analyze data and provide insights.' },
        { role: 'user', content: 'Please summarize this data for me.' }
      ]
    });
    
    // Create a test patch
    testPatch = new Patch({
      id: 'test-description-patch',
      name: 'Test Patch',
      description: '', // Start with empty description
      nodes: [],
      edges: []
    });
    
    // Mock Gear.findById
    jest.spyOn(Gear, 'findById').mockImplementation(async (id: string) => {
      if (id === 'test-description-gear') return testGear;
      return null;
    });
    
    // Mock Patch.findById
    jest.spyOn(Patch, 'findById').mockImplementation(async (id: string) => {
      if (id === 'test-description-patch') return testPatch;
      return null;
    });
    
    // Spy on save methods
    jest.spyOn(testPatch, 'save').mockImplementation(async () => {});
    jest.spyOn(testGear, 'save').mockImplementation(async () => {});
    
    // Mock generateDescription to actually set description on the patch
    jest.spyOn(Patch.prototype, 'generateDescription').mockImplementation(async function(this: any) {
      this.description = 'Test generated description for the patch';
      return this.description;
    });
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  it('should generate a description when a node is added to a patch', async () => {
    // Add a node to the patch
    const node = {
      id: 'node-1',
      type: 'gearNode',
      position: { x: 100, y: 100 },
      data: {
        gearId: 'test-description-gear',
        label: 'Test Processor'
      }
    };
    
    await testPatch.addNode(node);
    
    // Verify that generateDescription was called
    expect(testPatch.generateDescription).toHaveBeenCalled();
    
    // Verify the description was updated
    expect(testPatch.description).not.toBe('');
    
    // Verify the patch was saved
    expect(testPatch.save).toHaveBeenCalled();
  });
  
  it('should update patch description when a gear label changes', async () => {
    // First add the gear to the patch
    const node = {
      id: 'node-1',
      type: 'gearNode',
      position: { x: 100, y: 100 },
      data: {
        gearId: 'test-description-gear',
        label: 'Test Processor'
      }
    };
    
    await testPatch.addNode(node);
    
    // Reset the mock counts
    jest.clearAllMocks();
    
    // Define a temporary window object to bypass the early return in updateContainingPatchDescriptions
    const originalWindow = global.window;
    (global as any).window = {}; 
  
    // Mock updateContainingPatchDescriptions to call generateDescription on the patch
    jest.spyOn(testGear, 'updateContainingPatchDescriptions').mockImplementation(async () => {
      // Simulate what this method would do - call generateDescription on the patch
      await testPatch.generateDescription();
      await testPatch.save();
    });
    
    // Directly modify the gear's skipDescriptionUpdates property to ensure updateContainingPatchDescriptions runs
    (testGear as any).skipDescriptionUpdates = false;
    
    // Change the gear label
    await testGear.setLabel('New Processor Name');
    
    // Restore window
    (global as any).window = originalWindow;
    
    // Verify that updateContainingPatchDescriptions was called
    expect(testGear.updateContainingPatchDescriptions).toHaveBeenCalled();
    
    // Verify that the patch's generateDescription was called
    expect(testPatch.generateDescription).toHaveBeenCalled();
    
    // Verify the patch was saved
    expect(testPatch.save).toHaveBeenCalled();
  });
  
  it('should update patch description when connections are changed', async () => {
    // Create another gear
    const anotherGear = new Gear({
      id: 'another-test-gear',
      label: 'Another Processor',
      messages: [{ role: 'system', content: 'You process incoming data.' }]
    });
    
    // Update the mock to return this gear
    jest.spyOn(Gear, 'findById').mockImplementation(async (id: string) => {
      if (id === 'test-description-gear') return testGear;
      if (id === 'another-test-gear') return anotherGear;
      return null;
    });
    
    // Add both gears to the patch
    await testPatch.addNode({
      id: 'node-1',
      type: 'gearNode',
      position: { x: 100, y: 100 },
      data: {
        gearId: 'test-description-gear',
        label: 'Test Processor'
      }
    });
    
    await testPatch.addNode({
      id: 'node-2',
      type: 'gearNode',
      position: { x: 300, y: 100 },
      data: {
        gearId: 'another-test-gear',
        label: 'Another Processor'
      }
    });
    
    // Reset the mock counts
    jest.clearAllMocks();
    
    // Add a connection between the gears
    const edge = {
      id: 'edge-1-2',
      source: 'node-1',
      target: 'node-2'
    };
    
    await testPatch.addEdge(edge);
    
    // Verify that generateDescription was called
    expect(testPatch.generateDescription).toHaveBeenCalled();
    
    // Verify the patch was saved
    expect(testPatch.save).toHaveBeenCalled();
  });
});