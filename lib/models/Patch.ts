import { Gear } from "./Gear";
import { saveToKV, getFromKV, deleteFromKV, listKeysFromKV } from '../kv';

// No in-memory store - using Vercel KV exclusively for serverless architecture

export interface PatchNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    gearId: string;
    label: string;
    isProcessing?: boolean;
  };
}

export interface PatchEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface PatchData {
  id: string;
  name: string;
  description?: string;
  nodes: PatchNode[];
  edges: PatchEdge[];
  createdAt: number;
  updatedAt: number;
}

export class Patch {
  private data: PatchData;

  constructor(data: Partial<PatchData> & { id: string; name: string }) {
    this.data = {
      id: data.id,
      name: data.name,
      description: data.description || "",
      nodes: data.nodes || [],
      edges: data.edges || [],
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
    };
  }

  static async create(data: Partial<PatchData> & { id: string; name: string }): Promise<Patch> {
    const patch = new Patch(data);
    await patch.save();
    return patch;
  }
  
  static async deleteById(id: string): Promise<boolean> {
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        const response = await fetch(`/api/patches/${id}`, {
          method: 'DELETE',
        });
        
        const success = response.ok;
        
        // Also clean up localStorage for backward compatibility
        try {
          const savedPatchesStr = localStorage.getItem('patches');
          if (savedPatchesStr) {
            const savedPatches = JSON.parse(savedPatchesStr);
            const filteredPatches = savedPatches.filter((p: {id: string}) => p.id !== id);
            if (filteredPatches.length !== savedPatches.length) {
              localStorage.setItem('patches', JSON.stringify(filteredPatches));
            }
          }
        } catch (error) {
          console.error(`Error deleting patch ${id} from localStorage:`, error);
        }
        
        return success;
      } catch (error) {
        console.error(`Error deleting patch ${id}:`, error);
        
        // Fallback to just localStorage if API fails
        try {
          const savedPatchesStr = localStorage.getItem('patches');
          if (savedPatchesStr) {
            const savedPatches = JSON.parse(savedPatchesStr);
            const filteredPatches = savedPatches.filter((p: {id: string}) => p.id !== id);
            const success = filteredPatches.length !== savedPatches.length;
            if (success) {
              localStorage.setItem('patches', JSON.stringify(filteredPatches));
            }
            return success;
          }
        } catch (storageError) {
          console.error(`Error deleting patch ${id} from localStorage:`, storageError);
        }
        
        return false;
      }
    } else {
      // Server-side: Use KV directly
      const deleted = await deleteFromKV(`patch:${id}`);
      
      if (deleted) {
        console.log(`Deleted patch ${id} from KV`);
      }
      
      return deleted;
    }
  }

  static async findById(id: string): Promise<Patch | null> {
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        const response = await fetch(`/api/patches/${id}`);
        if (!response.ok) {
          // If not found on server, try localStorage as fallback
          try {
            const savedPatches = localStorage.getItem('patches');
            if (savedPatches) {
              const patches = JSON.parse(savedPatches);
              const localPatchData = patches.find((p: {id: string}) => p.id === id);
              
              if (localPatchData) {
                console.log(`Found patch ${id} in localStorage`);
                
                // Also create it on the server for future requests
                const createResponse = await fetch('/api/patches', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(localPatchData),
                });
                
                if (!createResponse.ok) {
                  console.warn(`Failed to migrate patch ${id} to server:`, await createResponse.text());
                }
                
                return new Patch(localPatchData);
              }
            }
          } catch (error) {
            console.error("Error loading patch from localStorage:", error);
          }
          return null;
        }
        
        const patchData = await response.json();
        return new Patch(patchData);
      } catch (error) {
        console.error(`Error fetching patch ${id}:`, error);
        return null;
      }
    } else {
      // Server-side: Use KV directly
      const patchData = await getFromKV<PatchData>(`patch:${id}`);
      
      if (patchData) {
        console.log(`Found patch ${id} in KV store`);
        return new Patch(patchData);
      }
      
      // Return null if patch not found
      return null;
    }
  }
  
  // Get all patches from the store
  static async findAll(): Promise<Patch[]> {
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        const response = await fetch('/api/patches');
        if (!response.ok) {
          // If server fails, try localStorage as fallback
          try {
            const savedPatchesStr = localStorage.getItem('patches');
            if (savedPatchesStr) {
              const savedPatches = JSON.parse(savedPatchesStr);
              return savedPatches.map((patchData: PatchData) => new Patch(patchData));
            }
          } catch (error) {
            console.error("Error loading patches from localStorage:", error);
          }
          return [];
        }
        
        const patchDataList = await response.json();
        return patchDataList.map((patchData: PatchData) => new Patch(patchData));
      } catch (error) {
        console.error("Error fetching patches:", error);
        
        // Fallback to localStorage
        try {
          const savedPatchesStr = localStorage.getItem('patches');
          if (savedPatchesStr) {
            const savedPatches = JSON.parse(savedPatchesStr);
            return savedPatches.map((patchData: PatchData) => new Patch(patchData));
          }
        } catch (error) {
          console.error("Error loading patches from localStorage:", error);
        }
        
        return [];
      }
    } else {
      // Server-side: Use KV directly
      const patches: Patch[] = [];
      
      // Get all patches from KV
      const keys = await listKeysFromKV('patch:*');
      
      for (const key of keys) {
        const patchData = await getFromKV<PatchData>(key);
        if (patchData) {
          patches.push(new Patch(patchData));
        }
      }
      
      return patches;
    }
  }

  async save(): Promise<void> {
    this.data.updatedAt = Date.now();
    
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        // Check if the patch already exists
        const checkResponse = await fetch(`/api/patches/${this.data.id}`);
        
        if (checkResponse.ok) {
          // Update existing patch
          const updateResponse = await fetch(`/api/patches/${this.data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.data),
          });
          
          if (!updateResponse.ok) {
            console.warn(`Failed to update patch ${this.data.id}:`, await updateResponse.text());
          }
        } else {
          // Create new patch
          const createResponse = await fetch('/api/patches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.data),
          });
          
          if (!createResponse.ok) {
            console.warn(`Failed to create patch ${this.data.id}:`, await createResponse.text());
          }
        }
        
        // For backward compatibility, also update localStorage
        try {
          // Get existing patches
          const savedPatchesStr = localStorage.getItem('patches');
          const savedPatches = savedPatchesStr ? JSON.parse(savedPatchesStr) : [];
          
          // Find index of this patch if it exists
          const patchIndex = savedPatches.findIndex((p: {id: string}) => p.id === this.data.id);
          
          if (patchIndex >= 0) {
            // Update existing patch
            savedPatches[patchIndex] = { ...this.data };
          } else {
            // Add new patch
            savedPatches.push({ ...this.data });
          }
          
          // Save back to localStorage
          localStorage.setItem('patches', JSON.stringify(savedPatches));
        } catch (error) {
          console.error("Error saving patch to localStorage:", error);
        }
      } catch (error) {
        console.error(`Error saving patch ${this.data.id}:`, error);
        
        // Fallback to localStorage only
        try {
          const savedPatchesStr = localStorage.getItem('patches');
          const savedPatches = savedPatchesStr ? JSON.parse(savedPatchesStr) : [];
          
          const patchIndex = savedPatches.findIndex((p: {id: string}) => p.id === this.data.id);
          
          if (patchIndex >= 0) {
            savedPatches[patchIndex] = { ...this.data };
          } else {
            savedPatches.push({ ...this.data });
          }
          
          localStorage.setItem('patches', JSON.stringify(savedPatches));
        } catch (storageError) {
          console.error("Error saving patch to localStorage:", storageError);
        }
      }
    } else {
      // Server-side: Use KV directly
      await saveToKV(`patch:${this.data.id}`, this.data);
      console.log(`Saved patch to KV: ${this.data.id}`);
    }
  }

  // Getters
  get id() {
    return this.data.id;
  }
  
  get name() {
    return this.data.name;
  }
  
  set name(newName: string) {
    this.data.name = newName;
  }
  
  get description() {
    return this.data.description || "";
  }
  
  set description(newDescription: string) {
    this.data.description = newDescription;
  }
  
  get nodes() {
    return this.data.nodes;
  }
  
  get edges() {
    return this.data.edges;
  }
  
  get createdAt() {
    return this.data.createdAt;
  }
  
  get updatedAt() {
    return this.data.updatedAt;
  }

  // Node management
  async addNode(node: PatchNode): Promise<void> {
    this.data.nodes.push(node);
    await this.save();
  }

  async updateNode(id: string, updates: Partial<PatchNode>): Promise<boolean> {
    const nodeIndex = this.data.nodes.findIndex(node => node.id === id);
    if (nodeIndex === -1) return false;
    
    this.data.nodes[nodeIndex] = {
      ...this.data.nodes[nodeIndex],
      ...updates,
    };
    
    await this.save();
    return true;
  }

  async removeNode(id: string): Promise<boolean> {
    const initialLength = this.data.nodes.length;
    this.data.nodes = this.data.nodes.filter(node => node.id !== id);
    
    // Also remove any edges connected to this node
    this.data.edges = this.data.edges.filter(
      edge => edge.source !== id && edge.target !== id
    );
    
    await this.save();
    return this.data.nodes.length < initialLength;
  }

  // Edge management
  async addEdge(edge: PatchEdge): Promise<void> {
    this.data.edges.push(edge);
    
    // Update the corresponding gears to establish the connection
    try {
      const sourceNode = this.data.nodes.find(node => node.id === edge.source);
      const targetNode = this.data.nodes.find(node => node.id === edge.target);
      
      if (sourceNode && targetNode) {
        const sourceGear = await Gear.findById(sourceNode.data.gearId);
        if (sourceGear) {
          const targetGearUrl = `/api/gears/${targetNode.data.gearId}/process`;
          await sourceGear.addOutputUrl(targetGearUrl);
        }
      }
    } catch (error) {
      console.error("Error updating gear connections:", error);
    }
    
    await this.save();
  }

  async updateEdge(id: string, updates: Partial<PatchEdge>): Promise<boolean> {
    const edgeIndex = this.data.edges.findIndex(edge => edge.id === id);
    if (edgeIndex === -1) return false;
    
    // If the connection is changing, update the gear connections
    const oldEdge = this.data.edges[edgeIndex];
    const newSourceId = updates.source || oldEdge.source;
    const newTargetId = updates.target || oldEdge.target;
    
    if (oldEdge.source !== newSourceId || oldEdge.target !== newTargetId) {
      try {
        // Remove old connection
        const oldSourceNode = this.data.nodes.find(node => node.id === oldEdge.source);
        const oldTargetNode = this.data.nodes.find(node => node.id === oldEdge.target);
        
        if (oldSourceNode && oldTargetNode) {
          const oldSourceGear = await Gear.findById(oldSourceNode.data.gearId);
          if (oldSourceGear) {
            const oldTargetUrl = `/api/gears/${oldTargetNode.data.gearId}/process`;
            await oldSourceGear.removeOutputUrl(oldTargetUrl);
          }
        }
        
        // Add new connection
        const newSourceNode = this.data.nodes.find(node => node.id === newSourceId);
        const newTargetNode = this.data.nodes.find(node => node.id === newTargetId);
        
        if (newSourceNode && newTargetNode) {
          const newSourceGear = await Gear.findById(newSourceNode.data.gearId);
          if (newSourceGear) {
            const newTargetUrl = `/api/gears/${newTargetNode.data.gearId}/process`;
            await newSourceGear.addOutputUrl(newTargetUrl);
          }
        }
      } catch (error) {
        console.error("Error updating gear connections:", error);
      }
    }
    
    this.data.edges[edgeIndex] = {
      ...this.data.edges[edgeIndex],
      ...updates,
    };
    
    await this.save();
    return true;
  }

  async removeEdge(id: string): Promise<boolean> {
    const edgeToRemove = this.data.edges.find(edge => edge.id === id);
    if (!edgeToRemove) return false;
    
    // Remove the connection between gears
    try {
      const sourceNode = this.data.nodes.find(node => node.id === edgeToRemove.source);
      const targetNode = this.data.nodes.find(node => node.id === edgeToRemove.target);
      
      if (sourceNode && targetNode) {
        const sourceGear = await Gear.findById(sourceNode.data.gearId);
        if (sourceGear) {
          const targetGearUrl = `/api/gears/${targetNode.data.gearId}/process`;
          await sourceGear.removeOutputUrl(targetGearUrl);
        }
      }
    } catch (error) {
      console.error("Error removing gear connection:", error);
    }
    
    const initialLength = this.data.edges.length;
    this.data.edges = this.data.edges.filter(edge => edge.id !== id);
    
    await this.save();
    return this.data.edges.length < initialLength;
  }

  // Export patch to ReactFlow format
  toReactFlowData() {
    return {
      nodes: this.data.nodes,
      edges: this.data.edges,
    };
  }
  
  // Import from ReactFlow format
  async updateFromReactFlow(reactFlowData: { nodes: PatchNode[]; edges: PatchEdge[] }): Promise<void> {
    // Update positions and other visual properties
    this.data.nodes = reactFlowData.nodes;
    
    // For each edge change, update gear connections
    const currentEdgeIds = new Set(this.data.edges.map(e => e.id));
    const newEdgeIds = new Set(reactFlowData.edges.map(e => e.id));
    
    // Remove edges that don't exist in the new data
    for (const edge of this.data.edges) {
      if (!newEdgeIds.has(edge.id)) {
        try {
          const sourceNode = this.data.nodes.find(node => node.id === edge.source);
          const targetNode = this.data.nodes.find(node => node.id === edge.target);
          
          if (sourceNode && targetNode) {
            const sourceGear = await Gear.findById(sourceNode.data.gearId);
            if (sourceGear) {
              const targetGearUrl = `/api/gears/${targetNode.data.gearId}/process`;
              await sourceGear.removeOutputUrl(targetGearUrl);
            }
          }
        } catch (error) {
          console.error("Error removing gear connection:", error);
        }
      }
    }
    
    // Add new edges that don't exist in the current data
    for (const edge of reactFlowData.edges) {
      if (!currentEdgeIds.has(edge.id)) {
        try {
          const sourceNode = reactFlowData.nodes.find(node => node.id === edge.source);
          const targetNode = reactFlowData.nodes.find(node => node.id === edge.target);
          
          if (sourceNode && targetNode) {
            const sourceGear = await Gear.findById(sourceNode.data.gearId);
            if (sourceGear) {
              const targetGearUrl = `/api/gears/${targetNode.data.gearId}/process`;
              await sourceGear.addOutputUrl(targetGearUrl);
            }
          }
        } catch (error) {
          console.error("Error adding gear connection:", error);
        }
      }
    }
    
    this.data.edges = reactFlowData.edges;
    await this.save();
  }
}