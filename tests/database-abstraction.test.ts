/**
 * Tests for the database abstraction layer
 */

import { Patch, PatchData } from '../lib/models/Patch';
import { Gear, GearData } from '../lib/models/Gear';
import { getDatabase } from '../lib/database';

// Mock the database module
jest.mock('../lib/database', () => {
  const mockDb = {
    saveDocument: jest.fn(),
    getDocument: jest.fn(),
    deleteDocument: jest.fn(),
    getAllDocuments: jest.fn(),
    
    savePatch: jest.fn(),
    getPatch: jest.fn(),
    deletePatch: jest.fn(),
    getAllPatches: jest.fn(),
    
    saveGear: jest.fn(),
    getGear: jest.fn(),
    deleteGear: jest.fn(),
    getAllGears: jest.fn(),
  };
  
  return {
    getDatabase: jest.fn(() => mockDb),
  };
});

describe('Database Abstraction', () => {
  const database = getDatabase();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Patch Model', () => {
    it('should use database abstraction for findById', async () => {
      // Setup
      const mockPatchData: Partial<PatchData> = {
        id: 'test-patch-id',
        name: 'Test Patch',
        nodes: [],
        edges: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      database.getPatch.mockResolvedValue(mockPatchData);
      
      // Execute
      const patch = await Patch.findById('test-patch-id');
      
      // Verify
      expect(database.getPatch).toHaveBeenCalledWith('test-patch-id');
      expect(patch).toBeInstanceOf(Patch);
      expect(patch?.id).toBe('test-patch-id');
    });
    
    it('should use database abstraction for save', async () => {
      // Setup
      const patch = new Patch({
        id: 'test-patch-id',
        name: 'Test Patch',
      });
      
      database.savePatch.mockResolvedValue(undefined);
      
      // Execute
      await patch.save();
      
      // Verify
      expect(database.savePatch).toHaveBeenCalledWith('test-patch-id', expect.any(Object));
    });
  });
  
  describe('Gear Model', () => {
    it('should use database abstraction for findById', async () => {
      // Setup
      const mockGearData: Partial<GearData> = {
        id: 'test-gear-id',
        outputUrls: [],
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      database.getGear.mockResolvedValue(mockGearData);
      
      // Execute
      const gear = await Gear.findById('test-gear-id');
      
      // Verify
      expect(database.getGear).toHaveBeenCalledWith('test-gear-id');
      expect(gear).toBeInstanceOf(Gear);
      expect(gear?.id).toBe('test-gear-id');
    });
    
    it('should use database abstraction for save', async () => {
      // Setup
      const gear = new Gear({
        id: 'test-gear-id',
      });
      
      database.saveGear.mockResolvedValue(undefined);
      
      // Execute
      await gear.save();
      
      // Verify
      expect(database.saveGear).toHaveBeenCalledWith('test-gear-id', expect.any(Object));
    });
  });
});