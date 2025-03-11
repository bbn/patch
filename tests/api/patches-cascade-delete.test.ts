import { describe, it, expect, afterEach } from '@jest/globals';
import { Patch } from '@/lib/models/Patch';
import { Gear } from '@/lib/models/Gear';
import { getFromKV, deleteFromKV } from '@/lib/kv';

// Mock the Gear module
jest.mock('@/lib/models/Gear', () => {
  const originalModule = jest.requireActual('@/lib/models/Gear');
  return {
    ...originalModule,
    Gear: {
      ...originalModule.Gear,
      deleteById: jest.fn().mockImplementation(async (id: string) => {
        console.log(`Mock deleting gear ${id}`);
        return true;
      }),
      findById: jest.fn().mockImplementation(async (id: string) => {
        if (id.startsWith('test-gear-')) {
          return new originalModule.Gear({
            id,
            label: `Test Gear ${id}`,
            messages: [],
            outputUrls: []
          });
        }
        return null;
      })
    }
  };
});

// Mock KV operations
jest.mock('@/lib/kv', () => ({
  getFromKV: jest.fn().mockImplementation(async (key: string) => {
    if (key === 'patch:test-patch-cascade') {
      return {
        id: 'test-patch-cascade',
        name: 'Test Patch for Cascade Delete',
        description: 'A test patch with gears that should be deleted when the patch is deleted',
        nodes: [
          {
            id: 'node1',
            type: 'default',
            position: { x: 100, y: 100 },
            data: {
              gearId: 'test-gear-1',
              label: 'Test Gear 1'
            }
          },
          {
            id: 'node2',
            type: 'default',
            position: { x: 300, y: 100 },
            data: {
              gearId: 'test-gear-2',
              label: 'Test Gear 2'
            }
          },
          {
            id: 'node3',
            type: 'default',
            position: { x: 500, y: 100 },
            data: {
              gearId: 'test-gear-3',
              label: 'Test Gear 3'
            }
          }
        ],
        edges: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
    return null;
  }),
  saveToKV: jest.fn().mockResolvedValue(true),
  deleteFromKV: jest.fn().mockResolvedValue(true),
  listKeysFromKV: jest.fn().mockResolvedValue([])
}));

describe('Patch Cascade Delete', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should delete all associated gears when a patch is deleted', async () => {
    // Delete the test patch
    const result = await Patch.deleteById('test-patch-cascade');
    
    // Verify the patch was deleted
    expect(result).toBe(true);
    expect(deleteFromKV).toHaveBeenCalledWith('patch:test-patch-cascade');
    
    // Verify that Gear.deleteById was called for each gear in the patch
    expect(Gear.deleteById).toHaveBeenCalledTimes(3);
    expect(Gear.deleteById).toHaveBeenCalledWith('test-gear-1');
    expect(Gear.deleteById).toHaveBeenCalledWith('test-gear-2');
    expect(Gear.deleteById).toHaveBeenCalledWith('test-gear-3');
  });

  it('should still delete the patch if some gear deletions fail', async () => {
    // Mock Gear.deleteById to fail for the second gear
    (Gear.deleteById as jest.Mock).mockImplementationOnce(async () => true) // first gear succeeds
      .mockImplementationOnce(async () => { 
        throw new Error('Failed to delete gear');
      }) // second gear fails
      .mockImplementationOnce(async () => true); // third gear succeeds
    
    // Delete the test patch
    const result = await Patch.deleteById('test-patch-cascade');
    
    // Verify the patch was still deleted despite gear deletion failure
    expect(result).toBe(true);
    expect(deleteFromKV).toHaveBeenCalledWith('patch:test-patch-cascade');
    
    // Verify that Gear.deleteById was called for each gear in the patch
    expect(Gear.deleteById).toHaveBeenCalledTimes(3);
  });

  it('should handle empty patches with no gears', async () => {
    // Mock getFromKV to return a patch with no nodes
    (getFromKV as jest.Mock).mockImplementationOnce(async () => ({
      id: 'test-empty-patch',
      name: 'Empty Test Patch',
      description: 'A patch with no gears',
      nodes: [],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));
    
    // Delete the empty patch
    const result = await Patch.deleteById('test-empty-patch');
    
    // Verify the patch was deleted
    expect(result).toBe(true);
    expect(deleteFromKV).toHaveBeenCalledWith('patch:test-empty-patch');
    
    // Verify that Gear.deleteById was not called
    expect(Gear.deleteById).not.toHaveBeenCalled();
  });
});