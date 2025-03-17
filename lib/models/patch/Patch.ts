import { getDatabase, Database } from '../../database';
import { doc, onSnapshot } from 'firebase/firestore';
import { db as firestoreDb } from '../../firebase';

// Get the appropriate database implementation based on environment
const database: Database = getDatabase();

import { PatchData, PatchNode, PatchEdge } from './types';
import { Gear } from '../gear';

export class Patch {
  private data: PatchData;
  private unsubscribe: (() => void) | null = null;

  constructor(data: Partial<PatchData> & { id: string; name: string }) {
    // Add diagnostic logging to understand what methods are available
    console.log("Patch constructor called, available methods:", 
      Object.getOwnPropertyNames(Object.getPrototypeOf(this)));
    console.log("Patch arrow functions:", 
      Object.keys(this).filter(key => typeof (this as any)[key] === 'function'));
    
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
  
  static async findById(id: string): Promise<Patch | null> {
    try {
      const patchData = await database.getPatch<PatchData>(id);
      
      if (patchData) {
        return new Patch(patchData);
      }
      return null;
    } catch (error) {
      console.error(`Error fetching patch ${id}:`, error);
      return null;
    }
  }
  
  // Add static deleteById method that delegates to the utility function
  static async deleteById(id: string): Promise<boolean> {
    // Import the deleteById function from utils
    const { deleteById } = await import('./utils');
    return deleteById(id);
  }
  
  // Add static findAll method that delegates to the utility function
  static async findAll(): Promise<Patch[]> {
    // Import the findAll function from utils
    const { findAll } = await import('./utils');
    return findAll();
  }
  
  // Add static generateAllDescriptions method that delegates to the utility function
  static async generateAllDescriptions(): Promise<number> {
    // Import the generateAllDescriptions function from utils
    const { generateAllDescriptions } = await import('./utils');
    return generateAllDescriptions();
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
    const docRef = doc(firestoreDb, 'patches', this.data.id);
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

  async save(): Promise<void> {
    this.data.updatedAt = Date.now();
    
    try {
      await database.savePatch(this.data.id, this.data);
    } catch (error) {
      console.error(`Error saving patch ${this.data.id}:`, error);
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

  // Export patch to ReactFlow format
  toReactFlowData() {
    return {
      nodes: this.data.nodes,
      edges: this.data.edges,
    };
  }

  // Node management methods as class properties to ensure they're preserved during export
  addNode = async (node: PatchNode, skipSave = false): Promise<void> => {
    this.data.nodes.push(node);
    
    // Generate a new description when node is added, as functionality might change
    await this.generateDescription(true); // Skip saving after description generation
    
    if (!skipSave) {
      await this.save();
    }
  }

  updateNode = async (id: string, updates: Partial<PatchNode>): Promise<boolean> => {
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

  removeNode = async (id: string): Promise<boolean> => {
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

  // Edge management methods
  addEdge = async (edge: PatchEdge): Promise<void> => {
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
                // Get the outputUrls from gear rather than directly from data
                outputUrls: [targetGearUrl] // Just add the new URL; the server will merge with existing ones
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

  updateEdge = async (id: string, updates: Partial<PatchEdge>): Promise<boolean> => {
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
    const getGearForUpdate = async (gearId: string) => {
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

  removeEdge = async (id: string): Promise<boolean> => {
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

  // ReactFlow integration
  updateFromReactFlow = async (reactFlowData: { nodes: any[]; edges: any[] }): Promise<void> => {
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
    const getGearForUpdate = async (gearId: string) => {
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
      this.data.updatedAt = Date.now();
      await this.save();
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
        try {
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
        } catch (error) {
          // Catch network errors specifically in the fetch call
          console.error(`Network error when generating description for patch ${this.id}:`, error);
          // Don't let the fetch error propagate to calling methods like addNode
          return this.description;
        }
      }
      
      return this.description; // Return existing description if server-side
    } catch (error) {
      console.error("Error generating patch description:", error);
      return this.description;
    }
  }
}