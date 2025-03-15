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
    console.log(`Adding edge from ${edge.source} to ${edge.target}`);
    
    // Check if edge already exists to avoid duplicates
    const edgeExists = this.data.edges.some(e => 
      e.source === edge.source && e.target === edge.target);
      
    if (edgeExists) {
      console.log(`Edge already exists from ${edge.source} to ${edge.target}, skipping`);
      return;
    }
    
    // Add the edge to the patch data
    this.data.edges.push(edge);
    
    // Flag to track if we need to update description
    let needsDescriptionUpdate = false;
    
    // Update the corresponding gears to establish the connection
    try {
      const sourceNode = this.data.nodes.find(node => node.id === edge.source);
      const targetNode = this.data.nodes.find(node => node.id === edge.target);
      
      if (sourceNode && targetNode) {
        // Use a standardized URL format for consistency
        const targetGearUrl = `/api/gears/${targetNode.data.gearId}`;
        
        // Add outputUrl directly to source gear - skip API call
        if (typeof window === 'undefined') {
          // On server-side, directly update Firestore in one operation
          const sourceGear = await Gear.findById(sourceNode.data.gearId);
          if (sourceGear) {
            // Skip description updates during connection to avoid redundant API calls
            sourceGear.skipDescriptionUpdates = true;
            
            // Add the output URL without individual save
            await sourceGear.addOutputUrl(targetGearUrl, true);
            
            // Save gear with the new URL
            await sourceGear.save();
            
            // Description should be updated after connections change
            needsDescriptionUpdate = true;
          }
        } else {
          // On client-side, use a single API call to update the gear
          try {
            const response = await fetch(`/api/gears/${sourceNode.data.gearId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                outputUrls: [...(sourceNode.data.outputUrls || []), targetGearUrl]
              })
            });
            
            if (response.ok) {
              needsDescriptionUpdate = true;
            }
          } catch (error) {
            console.error("Error updating gear connections via API:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error updating gear connections:", error);
    }
    
    // Save the patch
    await this.save();
    
    // Conditionally update description in a single operation
    // Only if we have multiple nodes and there was a connection change
    if (needsDescriptionUpdate && this.data.nodes.length > 1) {
      await this.generateDescription();
    }
  }

  async updateEdge(id: string, updates: Partial<PatchEdge>): Promise<boolean> {
    console.log(`Updating edge ${id}`);
    
    const edgeIndex = this.data.edges.findIndex(edge => edge.id === id);
    if (edgeIndex === -1) {
      console.log(`Edge ${id} not found`);
      return false;
    }
    
    // If the connection is changing, update the gear connections
    const oldEdge = this.data.edges[edgeIndex];
    const newSourceId = updates.source || oldEdge.source;
    const newTargetId = updates.target || oldEdge.target;
    
    // Track if connections changed to know if we need a new description
    let connectionsChanged = false;
    
    // Track gears to update in a batch
    const gearsToUpdate = new Map(); // Map<gearId, Gear>
    
    // Get a source gear and start batch update if needed
    const getGearForUpdate = async (gearId) => {
      if (gearsToUpdate.has(gearId)) {
        return gearsToUpdate.get(gearId);
      }
      
      const gear = await Gear.findById(gearId);
      if (gear) {
        gear.startBatchUpdate();
        gearsToUpdate.set(gearId, gear);
      }
      return gear;
    };
    
    if (oldEdge.source !== newSourceId || oldEdge.target !== newTargetId) {
      connectionsChanged = true;
      console.log(`Edge connections are changing from ${oldEdge.source}->${oldEdge.target} to ${newSourceId}->${newTargetId}`);
      
      try {
        // Process old connection
        if (oldEdge.source && oldEdge.target) {
          const oldSourceNode = this.data.nodes.find(node => node.id === oldEdge.source);
          const oldTargetNode = this.data.nodes.find(node => node.id === oldEdge.target);
          
          if (oldSourceNode && oldTargetNode) {
            // Batch the update
            const oldSourceGear = await getGearForUpdate(oldSourceNode.data.gearId);
            
            if (oldSourceGear) {
              const oldTargetUrl = `/api/gears/${oldTargetNode.data.gearId}`;
              // Remove URL without saving individually
              await oldSourceGear.removeOutputUrl(oldTargetUrl, true);
            }
          }
        }
        
        // Process new connection
        if (newSourceId && newTargetId) {
          const newSourceNode = this.data.nodes.find(node => node.id === newSourceId);
          const newTargetNode = this.data.nodes.find(node => node.id === newTargetId);
          
          if (newSourceNode && newTargetNode) {
            // Batch the update, possibly reusing the same gear
            const newSourceGear = await getGearForUpdate(newSourceNode.data.gearId);
            
            if (newSourceGear) {
              const newTargetUrl = `/api/gears/${newTargetNode.data.gearId}`;
              // Add URL without saving individually
              await newSourceGear.addOutputUrl(newTargetUrl, true);
            }
          }
        }
      } catch (error) {
        console.error("Error updating gear connections:", error);
      }
    }
    
    // Update the edge
    this.data.edges[edgeIndex] = {
      ...this.data.edges[edgeIndex],
      ...updates,
    };
    
    // Complete all gear batch updates in parallel
    const updatePromises = [];
    for (const gear of gearsToUpdate.values()) {
      updatePromises.push(gear.completeBatchUpdate(true));
    }
    
    // Wait for all gear updates to complete
    await Promise.all(updatePromises);
    
    // Save the patch changes
    await this.save();
    
    // Update description if connections changed and we have multiple nodes
    if (connectionsChanged && this.data.nodes.length > 1) {
      await this.generateDescription();
    }
    
    return true;
  }

  async removeEdge(id: string): Promise<boolean> {
    const edgeToRemove = this.data.edges.find(edge => edge.id === id);
    if (!edgeToRemove) return false;
    
    // First update the edge list without saving
    const initialLength = this.data.edges.length;
    this.data.edges = this.data.edges.filter(edge => edge.id !== id);
    
    if (this.data.edges.length >= initialLength) {
      console.log(`No edge with ID ${id} found in patch ${this.id}`);
      return false;
    }
    
    // Use batch updates for the source gear to avoid multiple API calls
    try {
      const sourceNode = this.data.nodes.find(node => node.id === edgeToRemove.source);
      const targetNode = this.data.nodes.find(node => node.id === edgeToRemove.target);
      
      if (sourceNode && targetNode) {
        const sourceGear = await Gear.findById(sourceNode.data.gearId);
        if (sourceGear) {
          console.log(`Updating source gear ${sourceGear.id} to remove connection`);
          
          // Start batch update to avoid individual saves
          sourceGear.startBatchUpdate();
          
          // Remove URL without saving
          const targetGearUrl = `/api/gears/${targetNode.data.gearId}`;
          const urlWasRemoved = await sourceGear.removeOutputUrl(targetGearUrl, true);
          
          if (urlWasRemoved) {
            // Only generate new description if connection was actually removed
            console.log(`Connection removed from ${sourceGear.id} to ${targetNode.data.gearId}`);
            
            // Complete batch update with a single save
            await sourceGear.completeBatchUpdate(true);
          } else {
            // If URL wasn't found, just cancel the batch
            sourceGear.skipDescriptionUpdates = false;
            console.log(`No connection found from ${sourceGear.id} to ${targetNode.data.gearId}`);
          }
        }
      }
      
      // Save the patch (will save edge changes)
      await this.save();
      
      // Only generate description if we actually removed an edge and have more than one node
      if (this.data.nodes.length > 1) {
        // Generate a new description when an edge is removed, as it changes the functionality
        await this.generateDescription();
      }
      
      return true;
    } catch (error) {
      console.error(`Error removing edge ${id}:`, error);
      // Still save the edge change even if gear update failed
      await this.save();
      return true;
    }
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
    // Keep track of changes to determine if we need to update the description
    let edgesChanged = false;
    
    // Update positions and other visual properties
    this.data.nodes = reactFlowData.nodes;
    
    // For each edge change, update gear connections
    const currentEdgeIds = new Set(this.data.edges.map(e => e.id));
    const newEdgeIds = new Set(reactFlowData.edges.map(e => e.id));
    
    // Track gear updates to batch them
    const gearUpdates = new Map(); // Map<gearId, Gear>
    
    // Get a source gear and start batch update if needed
    const getGearForUpdate = async (gearId) => {
      if (gearUpdates.has(gearId)) {
        return gearUpdates.get(gearId);
      }
      
      const gear = await Gear.findById(gearId);
      if (gear) {
        gear.startBatchUpdate();
        gearUpdates.set(gearId, gear);
      }
      return gear;
    };
    
    // Remove edges that don't exist in the new data
    for (const edge of this.data.edges) {
      if (!newEdgeIds.has(edge.id)) {
        edgesChanged = true;
        try {
          const sourceNode = this.data.nodes.find(node => node.id === edge.source);
          const targetNode = this.data.nodes.find(node => node.id === edge.target);
          
          if (sourceNode && targetNode) {
            // Get or create gear with batch update
            const sourceGear = await getGearForUpdate(sourceNode.data.gearId);
            
            if (sourceGear) {
              const targetGearUrl = `/api/gears/${targetNode.data.gearId}`;
              // Remove URL without saving individually
              await sourceGear.removeOutputUrl(targetGearUrl, true);
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
        edgesChanged = true;
        try {
          const sourceNode = reactFlowData.nodes.find(node => node.id === edge.source);
          const targetNode = reactFlowData.nodes.find(node => node.id === edge.target);
          
          if (sourceNode && targetNode) {
            // Get or create gear with batch update
            const sourceGear = await getGearForUpdate(sourceNode.data.gearId);
            
            if (sourceGear) {
              const targetGearUrl = `/api/gears/${targetNode.data.gearId}`;
              // Check if URL exists before adding
              if (!sourceGear.outputUrls.includes(targetGearUrl)) {
                sourceGear.data.outputUrls.push(targetGearUrl);
                // Mark for saving without saving individually
                sourceGear.pendingChanges = true;
              }
            }
          }
        } catch (error) {
          console.error("Error adding gear connection:", error);
        }
      }
    }
    
    // Complete all gear batch updates
    const updatePromises = [];
    for (const gear of gearUpdates.values()) {
      updatePromises.push(gear.completeBatchUpdate(true));
    }
    
    // Wait for all gear updates to complete
    await Promise.all(updatePromises);
    
    // Update edges in patch data
    this.data.edges = reactFlowData.edges;
    
    // Generate a description only if the patch's functionality has changed
    // and there are multiple nodes
    if (edgesChanged && this.data.nodes.length > 1) {
      await this.generateDescription();
    } else {
      // Just save the visual changes
      // If we're on the client side, use direct Firebase save instead of going through API
      this.data.updatedAt = Date.now();
      
      if (typeof window !== 'undefined') {
        try {
          // Client-side: Save directly to Firestore
          await savePatch(this.data.id, this.data);
          console.log(`Saved patch directly to Firestore (client-side): ${this.data.id}`);
        } catch (error) {
          console.error(`Error saving patch directly to Firestore: ${this.data.id}`, error);
          
          // Fallback to API if direct save fails
          await fetch(`/api/patches/${this.data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.data),
          });
        }
      } else {
        // Server-side: Use Firebase Admin SDK
        await this.save();
      }
    }
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
      
      // Only generate description if we have gears and connections 
      if (this.nodes.length === 0) {
        console.log(`Skipping description generation for empty patch ${this.id}`);
        return this.description;
      }
      
      // For patches with only default gears, don't regenerate unless forced
      const hasOnlyDefaultGears = this.nodes.every(node => 
        node.data.label.startsWith("Gear "));
        
      if (hasOnlyDefaultGears && this.edges.length === 0 && this.description) {
        console.log(`Skipping description generation for patch ${this.id} with only default gears`);
        return this.description;
      }
      
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