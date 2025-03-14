import { Gear } from "./Gear";
// Import client-side operations
import { savePatch, getPatch, deletePatch, getAllPatches } from '../firestore';

// Import server-side operations for Node.js environment
// Using dynamic import to avoid bundling firebase-admin code in client components
let savePatchAdmin: (id: string, data: any) => Promise<void>;
let getPatchAdmin: <T>(id: string) => Promise<T | null>;
let deletePatchAdmin: (id: string) => Promise<boolean>;
let getAllPatchesAdmin: () => Promise<any[]>;

// Only import server functions if running on the server
if (typeof window === 'undefined') {
  // Using require instead of import to avoid bundling issues
  const serverFunctions = require('../server/firestore-admin');
  savePatchAdmin = serverFunctions.savePatchAdmin;
  getPatchAdmin = serverFunctions.getPatchAdmin;
  deletePatchAdmin = serverFunctions.deletePatchAdmin;
  getAllPatchesAdmin = serverFunctions.getAllPatchesAdmin;
}
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';

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
  private unsubscribe: (() => void) | null = null;

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
    
    // If there are nodes in the patch, generate a description
    if (data.nodes && data.nodes.length > 0) {
      await patch.generateDescription();
    }
    
    await patch.save();
    return patch;
  }
  
  static async deleteById(id: string): Promise<boolean> {
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        // Delete the patch via API (which will cascade delete the gears on the server)
        console.log(`Calling API to delete patch ${id} and associated gears`);
        const response = await fetch(`/api/patches/${id}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error response from patch deletion API: ${response.status} ${errorText}`);
          throw new Error(`HTTP error deleting patch! status: ${response.status} - ${errorText}`);
        }
        
        console.log(`Successfully deleted patch ${id} via API`);
        return true;
      } catch (error) {
        console.error(`Error deleting patch ${id}:`, error);
        return false;
      }
    } else {
      // Server-side: Use Firestore directly
      // First retrieve the patch to get all gear IDs
      try {
        // Get the patch
        const patch = await Patch.findById(id);
        if (!patch) {
          console.log(`Patch ${id} not found for deletion`);
          return false;
        }
        
        // Extract all gear IDs from the nodes
        const gearIds = patch.nodes.map(node => node.data.gearId);
        
        // Log how many gears will be deleted
        console.log(`Deleting patch ${id} with ${gearIds.length} associated gears`);
        
        // Delete each gear and track any failures
        const deletionResults = await Promise.allSettled(
          gearIds.map(gearId => Gear.deleteById(gearId))
        );
        
        // Log any failures, but continue with patch deletion
        let failureCount = 0;
        deletionResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            failureCount++;
            console.error(`Failed to delete gear ${gearIds[index]}:`, result.reason);
          } else if (!result.value) {
            failureCount++;
            console.warn(`Gear ${gearIds[index]} could not be deleted or was not found`);
          }
        });
        
        if (failureCount > 0) {
          console.warn(`${failureCount} out of ${gearIds.length} gears failed to delete. Continuing with patch deletion.`);
        }
        
        // Delete the patch itself from Firestore using Admin SDK
        const deleted = await deletePatchAdmin(id);
        
        if (deleted) {
          console.log(`Successfully deleted patch ${id} from Firestore along with ${gearIds.length - failureCount} gears`);
        } else {
          console.error(`Failed to delete patch ${id} from Firestore after deleting gears`);
        }
        
        return deleted;
      } catch (error) {
        console.error(`Error during cascade deletion of patch ${id}:`, error);
        
        // Attempt to delete the patch anyway, even if gear deletion had errors
        try {
          console.log(`Attempting to delete patch ${id} despite errors with gear deletion`);
          const deleted = await deletePatchAdmin(id);
          if (deleted) {
            console.log(`Deleted patch ${id} from Firestore despite gear deletion errors`);
          } else {
            console.error(`Failed to delete patch ${id} from Firestore after gear deletion errors`);
          }
          return deleted;
        } catch (kvError) {
          console.error(`Failed to delete patch ${id} from Firestore:`, kvError);
          return false;
        }
      }
    }
  }

  static async findById(id: string): Promise<Patch | null> {
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        const response = await fetch(`/api/patches/${id}`);
        if (!response.ok) {
          return null;
        }
        
        const patchData = await response.json();
        return new Patch(patchData);
      } catch (error) {
        console.error(`Error fetching patch ${id}:`, error);
        return null;
      }
    } else {
      // Server-side: Use Firebase Admin SDK
      const patchData = await getPatchAdmin<PatchData>(id);
      
      if (patchData) {
        console.log(`Found patch ${id} in Firestore`);
        return new Patch(patchData);
      }
      
      // Return null if patch not found
      return null;
    }
  }

  // Subscribe to real-time updates for a patch
  // This should be called on client-side only
  subscribeToUpdates(callback: (patch: Patch) => void): () => void {
    if (typeof window === 'undefined') {
      console.warn('subscribeToUpdates should only be called on the client side');
      return () => {};
    }

    // Unsubscribe from any existing subscription
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    // Create a new subscription
    const docRef = doc(db, 'patches', this.data.id);
    this.unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const updatedData = docSnap.data() as PatchData;
        // Update the internal data
        this.data = updatedData;
        // Notify the callback
        callback(this);
      }
    }, (error) => {
      console.error(`Error in real-time updates for patch ${this.data.id}:`, error);
    });

    // Return the unsubscribe function
    return () => {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
    };
  }
  
  /**
   * Generate descriptions for all patches in the system
   * This is useful when introducing the description feature to ensure all patches have descriptions.
   */
  static async generateAllDescriptions(): Promise<number> {
    console.log("Generating descriptions for all patches...");
    
    // Load all patches
    const patches = await Patch.findAll();
    console.log(`Found ${patches.length} patches to process`);
    
    let successCount = 0;
    
    // Process each patch
    for (const patch of patches) {
      if (patch.nodes.length > 0) {
        try {
          console.log(`Generating description for patch ${patch.id}: ${patch.name}`);
          await patch.generateDescription();
          await patch.save();
          successCount++;
        } catch (error) {
          console.error(`Error generating description for patch ${patch.id}:`, error);
        }
      } else {
        console.log(`Skipping patch ${patch.id} with no nodes`);
      }
    }
    
    console.log(`Successfully updated descriptions for ${successCount} patches`);
    return successCount;
  }
  
  // Get all patches from the store
  static async findAll(): Promise<Patch[]> {
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        const response = await fetch('/api/patches');
        if (!response.ok) {
          return [];
        }
        
        const patchDataList = await response.json();
        return patchDataList.map((patchData: PatchData) => new Patch(patchData));
      } catch (error) {
        console.error("Error fetching patches:", error);
        return [];
      }
    } else {
      // Server-side: Use Firebase Admin SDK
      const patches: Patch[] = [];
      
      // Get all patches from Firestore using Admin SDK
      const patchDataList = await getAllPatchesAdmin();
      
      for (const patchData of patchDataList) {
        patches.push(new Patch(patchData as PatchData));
      }
      
      return patches;
    }
  }

  // Subscribe to real-time updates for all patches
  // This should be called on client-side only
  static subscribeToAll(callback: (patches: Patch[]) => void): () => void {
    if (typeof window === 'undefined') {
      console.warn('subscribeToAll should only be called on the client side');
      return () => {};
    }

    // Create a new subscription to the patches collection
    const patchesRef = collection(db, 'patches');
    const unsubscribe = onSnapshot(patchesRef, (querySnapshot) => {
      const patches: Patch[] = [];
      querySnapshot.forEach((doc) => {
        patches.push(new Patch(doc.data() as PatchData));
      });
      callback(patches);
    }, (error) => {
      console.error('Error in real-time updates for all patches:', error);
    });

    // Return the unsubscribe function
    return unsubscribe;
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
      } catch (error) {
        console.error(`Error saving patch ${this.data.id}:`, error);
      }
    } else {
      // Server-side: Use Firebase Admin SDK
      await savePatchAdmin(this.data.id, this.data);
      console.log(`Saved patch to Firestore (server-side): ${this.data.id}`);
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
  async addNode(node: PatchNode, skipSave = false): Promise<void> {
    this.data.nodes.push(node);
    
    // Generate a new description when node is added, as functionality might change
    await this.generateDescription(true); // Skip saving after description generation
    
    if (!skipSave) {
      await this.save();
    }
  }

  async updateNode(id: string, updates: Partial<PatchNode>): Promise<boolean> {
    const nodeIndex = this.data.nodes.findIndex(node => node.id === id);
    if (nodeIndex === -1) return false;
    
    // Check if the gearId is changing - this would change functionality
    const isChangingGear = updates.data?.gearId && 
      updates.data.gearId !== this.data.nodes[nodeIndex].data.gearId;
    
    this.data.nodes[nodeIndex] = {
      ...this.data.nodes[nodeIndex],
      ...updates,
    };
    
    // If changing the gear, update the description
    if (isChangingGear) {
      await this.generateDescription();
    }
    
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
    
    // Generate a new description when nodes are removed, as functionality might change
    if (this.data.nodes.length < initialLength) {
      await this.generateDescription();
    }
    
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
          // Use a standardized URL format for consistency
          const targetGearUrl = `/api/gears/${targetNode.data.gearId}`;
          
          // Check if this connection already exists to avoid duplicates
          if (!sourceGear.outputUrls.includes(targetGearUrl)) {
            await sourceGear.addOutputUrl(targetGearUrl);
          }
        }
      }
    } catch (error) {
      console.error("Error updating gear connections:", error);
    }
    
    // Generate a new description when an edge is added, as connections change the functionality
    await this.generateDescription();
    
    await this.save();
  }

  async updateEdge(id: string, updates: Partial<PatchEdge>): Promise<boolean> {
    const edgeIndex = this.data.edges.findIndex(edge => edge.id === id);
    if (edgeIndex === -1) return false;
    
    // If the connection is changing, update the gear connections
    const oldEdge = this.data.edges[edgeIndex];
    const newSourceId = updates.source || oldEdge.source;
    const newTargetId = updates.target || oldEdge.target;
    
    // Track if connections changed to know if we need a new description
    let connectionsChanged = false;
    
    if (oldEdge.source !== newSourceId || oldEdge.target !== newTargetId) {
      connectionsChanged = true;
      try {
        // Remove old connection
        const oldSourceNode = this.data.nodes.find(node => node.id === oldEdge.source);
        const oldTargetNode = this.data.nodes.find(node => node.id === oldEdge.target);
        
        if (oldSourceNode && oldTargetNode) {
          const oldSourceGear = await Gear.findById(oldSourceNode.data.gearId);
          if (oldSourceGear) {
            const oldTargetUrl = `/api/gears/${oldTargetNode.data.gearId}`;
            await oldSourceGear.removeOutputUrl(oldTargetUrl);
          }
        }
        
        // Add new connection
        const newSourceNode = this.data.nodes.find(node => node.id === newSourceId);
        const newTargetNode = this.data.nodes.find(node => node.id === newTargetId);
        
        if (newSourceNode && newTargetNode) {
          const newSourceGear = await Gear.findById(newSourceNode.data.gearId);
          if (newSourceGear) {
            const newTargetUrl = `/api/gears/${newTargetNode.data.gearId}`;
            
            // Check if this connection already exists to avoid duplicates
            if (!newSourceGear.outputUrls.includes(newTargetUrl)) {
              await newSourceGear.addOutputUrl(newTargetUrl);
            }
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
    
    // Update description if connections changed
    if (connectionsChanged) {
      await this.generateDescription();
    }
    
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
          const targetGearUrl = `/api/gears/${targetNode.data.gearId}`;
          await sourceGear.removeOutputUrl(targetGearUrl);
        }
      }
    } catch (error) {
      console.error("Error removing gear connection:", error);
    }
    
    const initialLength = this.data.edges.length;
    this.data.edges = this.data.edges.filter(edge => edge.id !== id);
    
    // Generate a new description when an edge is removed, as it changes the functionality
    if (this.data.edges.length < initialLength) {
      await this.generateDescription();
    }
    
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
  async updateFromReactFlow(reactFlowData: { nodes: any[]; edges: any[] }): Promise<void> {
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
              const targetGearUrl = `/api/gears/${targetNode.data.gearId}`;
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
              const targetGearUrl = `/api/gears/${targetNode.data.gearId}`;
              await sourceGear.addOutputUrl(targetGearUrl);
            }
          }
        } catch (error) {
          console.error("Error adding gear connection:", error);
        }
      }
    }
    
    this.data.edges = reactFlowData.edges;
    
    // Generate a description since the patch's functionality has changed
    await this.generateDescription();
    
    await this.save();
  }
  
  /**
   * Generates a description for the patch based on its contents.
   * When a patch's functionality changes, this will update the description.
   * 
   * Use static method Patch.generateAllDescriptions() to update descriptions for all patches.
   */
  async generateDescription(skipSave = false): Promise<string> {
    try {
      console.log(`Generating description for patch ${this.id}`);
      
      // Always make the API call if client-side
      if (typeof window !== 'undefined') {
        console.log(`Calling description API for patch ${this.id}`);
        // Use the dedicated endpoint for patch descriptions
        const response = await fetch(`/api/patches/${this.id}/description`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        
        if (!response.ok) {
          console.error(`Error generating description: ${response.status}`);
          return this.description; // Keep existing description if API fails
        }
        
        // Get the description from the response
        const description = await response.text();
        
        // Clean up the description and limit its length
        const cleanedDescription = description
          .replace(/[\r\n"]+/g, '') // Remove newlines and quotes
          .trim()
          .substring(0, 120); // Enforce character limit
        
        console.log(`Generated description: "${cleanedDescription}"`);
        this.data.description = cleanedDescription;
        
        // Only save if not skipped
        if (!skipSave) {
          await this.save();
        }
        
        return cleanedDescription;
      }
      
      return this.description; // Return existing description if server-side
    } catch (error) {
      console.error("Error generating patch description:", error);
      return this.description;
    }
  }
}