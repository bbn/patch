import { Patch } from './Patch';
import { Gear } from '../gear';

/**
 * Import data from ReactFlow format
 */
export async function updateFromReactFlow(patch: Patch, reactFlowData: { nodes: any[]; edges: any[] }): Promise<void> {
  // Keep track of changes to determine if we need to update the description
  let edgesChanged = false;
  
  // Update positions and other visual properties
  patch.nodes = reactFlowData.nodes;
  
  // For each edge change, update gear connections
  const currentEdgeIds = new Set(patch.edges.map(e => e.id));
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
  for (const edge of patch.edges) {
    if (!newEdgeIds.has(edge.id)) {
      edgesChanged = true;
      try {
        const sourceNode = patch.nodes.find(node => node.id === edge.source);
        const targetNode = patch.nodes.find(node => node.id === edge.target);
        
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
  patch.edges = reactFlowData.edges;
  
  // Generate a description only if the patch's functionality has changed
  // and there are multiple nodes
  if (edgesChanged && patch.nodes.length > 1) {
    await patch.generateDescription();
  } else {
    // Just save the visual changes
    patch.data.updatedAt = Date.now();
    await patch.save();
  }
}