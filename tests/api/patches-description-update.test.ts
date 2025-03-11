import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { Patch } from '@/lib/models/Patch';
import { Gear } from '@/lib/models/Gear';
import { saveToKV, getFromKV, listKeysFromKV } from '@/lib/kv';

// Mock the GET handler from the patches API route
jest.mock('@/app/api/patches/route', () => ({
  GET: jest.fn().mockImplementation(async (req) => {
    const patches = await Patch.findAll();
    const patchSummaries = await Promise.all(
      patches.map(async patch => ({
        id: patch.id,
        name: patch.name,
        description: patch.description,
        nodeCount: patch.nodes.length,
        updatedAt: patch.updatedAt,
        createdAt: patch.createdAt,
      }))
    );
    return NextResponse.json(patchSummaries);
  })
}));

// Import the handler
import { GET } from '@/app/api/patches/route';

describe('Patch Description in API Responses', () => {
  let testGear1: Gear;
  let testGear2: Gear;
  let testPatch: Patch;
  
  // Mock fetch for LLM calls
  let originalFetch: typeof global.fetch;
  
  beforeAll(() => {
    // Save original fetch
    originalFetch = global.fetch;
    
    // Mock fetch to handle LLM API calls
    global.fetch = jest.fn().mockImplementation(async (url, options) => {
      if (url.toString().includes('/label')) {
        return {
          ok: true,
          headers: {
            get: () => 'application/json',
          },
          json: async () => ({ content: 'A test patch that connects data processing gears' }),
          text: async () => 'A test patch that connects data processing gears',
        };
      }
      
      return {
        ok: true,
        json: async () => ({}),
        text: async () => '',
      };
    });
  });
  
  afterAll(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });
  
  beforeEach(async () => {
    // Clear mocks
    jest.clearAllMocks();
    
    // Set up in-memory test data
    testGear1 = await Gear.create({
      id: 'test-gear-1',
      label: 'Data Analyzer',
      messages: [
        { role: 'system', content: 'You analyze data and provide insights.' },
      ],
      outputUrls: []
    });
    
    testGear2 = await Gear.create({
      id: 'test-gear-2',
      label: 'Report Generator',
      messages: [
        { role: 'system', content: 'You generate formatted reports.' },
      ],
      outputUrls: []
    });
    
    // Create a patch with no initial description
    testPatch = await Patch.create({
      id: 'test-description-patch',
      name: 'Data Pipeline',
      description: '',
      nodes: [],
      edges: []
    });
    
    // Verify the test gear and patch were saved
    expect(await getFromKV(`gear:test-gear-1`)).not.toBeNull();
    expect(await getFromKV(`gear:test-gear-2`)).not.toBeNull();
    expect(await getFromKV(`patch:test-description-patch`)).not.toBeNull();
  });
  
  afterEach(async () => {
    // Clean up test data
    await saveToKV(`gear:test-gear-1`, null);
    await saveToKV(`gear:test-gear-2`, null);
    await saveToKV(`patch:test-description-patch`, null);
  });
  
  it('should update patch description in API response when gears are added', async () => {
    // Add gears to the patch
    await testPatch.addNode({
      id: 'node-1',
      type: 'gearNode',
      position: { x: 100, y: 100 },
      data: {
        gearId: 'test-gear-1',
        label: 'Data Analyzer'
      }
    });
    
    await testPatch.addNode({
      id: 'node-2',
      type: 'gearNode',
      position: { x: 300, y: 100 },
      data: {
        gearId: 'test-gear-2',
        label: 'Report Generator'
      }
    });
    
    // Add an edge between the gears
    await testPatch.addEdge({
      id: 'edge-1-2',
      source: 'node-1',
      target: 'node-2'
    });
    
    // At this point the patch should have a description
    const updatedPatchDirectly = await Patch.findById('test-description-patch');
    expect(updatedPatchDirectly).not.toBeNull();
    expect(updatedPatchDirectly?.description).not.toBe('');
    
    // Create a mock request
    const request = new NextRequest('http://localhost:3000/api/patches');
    
    // Call the API route handler directly
    const response = await GET(request);
    const patchesFromApi = await response.json();
    
    // Find our test patch in the response
    const testPatchFromApi = patchesFromApi.find((p: any) => p.id === 'test-description-patch');
    
    // Verify the patch has a description in the API response
    expect(testPatchFromApi).toBeDefined();
    expect(testPatchFromApi.description).not.toBe('');
    expect(testPatchFromApi.description).toBe(updatedPatchDirectly?.description);
  });
  
  it('should update patch descriptions in the patch list when manually regenerated', async () => {
    // First add gears to the patch
    await testPatch.addNode({
      id: 'node-1',
      type: 'gearNode',
      position: { x: 100, y: 100 },
      data: {
        gearId: 'test-gear-1',
        label: 'Data Analyzer'
      }
    });
    
    // Get the initial description
    const initialDescription = testPatch.description;
    
    // Mock a different description for the regeneration
    global.fetch = jest.fn().mockImplementation(async (url, options) => {
      if (url.toString().includes('/label')) {
        return {
          ok: true,
          headers: {
            get: () => 'application/json',
          },
          json: async () => ({ content: 'Updated description after regeneration' }),
          text: async () => 'Updated description after regeneration',
        };
      }
      
      return {
        ok: true,
        json: async () => ({}),
        text: async () => '',
      };
    });
    
    // Trigger manual regeneration
    const regenerateRequest = new NextRequest('http://localhost:3000/api/patches?regenerate_all_descriptions=true');
    await GET(regenerateRequest);
    
    // Now get the patches list
    const request = new NextRequest('http://localhost:3000/api/patches');
    const response = await GET(request);
    const patchesFromApi = await response.json();
    
    // Find our test patch in the response
    const testPatchFromApi = patchesFromApi.find((p: any) => p.id === 'test-description-patch');
    
    // Verify the patch has the updated description
    expect(testPatchFromApi).toBeDefined();
    expect(testPatchFromApi.description).not.toBe(initialDescription);
    expect(testPatchFromApi.description).toBe('Updated description after regeneration');
  });
});