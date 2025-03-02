import { Gear } from "./Gear";

// In-memory store for development purposes
const patchStore = new Map<string, PatchData>();

export interface PatchNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    gearId: string;
    label: string;
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
    if (patchStore.has(id)) {
      return patchStore.delete(id);
    }
    return false;
  }

  static async findById(id: string): Promise<Patch | null> {
    // Check if patch exists in memory store
    if (patchStore.has(id)) {
      return new Patch(patchStore.get(id)!);
    }
    
    // Return null if patch not found
    return null;
  }
  
  // Get all patches from the store
  static async findAll(): Promise<Patch[]> {
    return Array.from(patchStore.values()).map(data => new Patch(data));
  }

  async save(): Promise<void> {
    this.data.updatedAt = Date.now();
    // Store in memory map
    patchStore.set(this.data.id, { ...this.data });
  }

  // Getters
  get id() {
    return this.data.id;
  }
  
  get name() {
    return this.data.name;
  }
  
  get description() {
    return this.data.description;
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