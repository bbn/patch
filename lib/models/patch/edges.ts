import { Patch } from './Patch';
import { PatchEdge } from './types';
import { Gear } from '../gear';
import { logInfo, logError } from '@/lib/logger';

/**
 * Add an edge to a patch
 */
export async function addEdge(patch: Patch, edge: PatchEdge): Promise<void> {
  logInfo("PatchEdges", `Adding edge from ${edge.source} to ${edge.target}`);
  
  // Check if edge already exists to avoid duplicates
  const edgeExists = patch.edges.some(e => 
    e.source === edge.source && e.target === edge.target);
    
  if (edgeExists) {
    logInfo("PatchEdges", `Edge already exists from ${edge.source} to ${edge.target}, skipping`);
    return;
  }
  
  // Add the edge to the patch data
  patch.edges.push(edge);
  
  // Flag to track if we need to update description
  let needsDescriptionUpdate = false;
  
  // Update the corresponding gears to establish the connection
  try {
    const sourceNode = patch.nodes.find(node => node.id === edge.source);
    const targetNode = patch.nodes.find(node => node.id === edge.target);
    
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
          logError("PatchEdges", "Error updating gear connections via API", error);
        }
      }
    }
  } catch (error) {
    logError("PatchEdges", "Error updating gear connections", error);
  }
  
  // Save the patch
  await patch.save();
  
  // Conditionally update description in a single operation
  // Only if we have multiple nodes and there was a connection change
  if (needsDescriptionUpdate && patch.nodes.length > 1) {
    await patch.generateDescription();
  }
}

/**
 * Update an edge in a patch
 */
export async function updateEdge(patch: Patch, id: string, updates: Partial<PatchEdge>): Promise<boolean> {
  logInfo("PatchEdges", `Updating edge ${id}`);
  
  const edgeIndex = patch.edges.findIndex(edge => edge.id === id);
  if (edgeIndex === -1) {
    logInfo("PatchEdges", `Edge ${id} not found`);
    return false;
  }
  
  // If the connection is changing, update the gear connections
  const oldEdge = patch.edges[edgeIndex];
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
    logInfo(
      "PatchEdges",
      `Edge connections are changing from ${oldEdge.source}->${oldEdge.target} to ${newSourceId}->${newTargetId}`
    );
    
    try {
      // Process old connection
      if (oldEdge.source && oldEdge.target) {
        const oldSourceNode = patch.nodes.find(node => node.id === oldEdge.source);
        const oldTargetNode = patch.nodes.find(node => node.id === oldEdge.target);
        
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
        const newSourceNode = patch.nodes.find(node => node.id === newSourceId);
        const newTargetNode = patch.nodes.find(node => node.id === newTargetId);
        
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
      logError("PatchEdges", "Error updating gear connections", error);
    }
  }
  
  // Update the edge
  patch.edges[edgeIndex] = {
    ...patch.edges[edgeIndex],
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
  await patch.save();
  
  // Update description if connections changed and we have multiple nodes
  if (connectionsChanged && patch.nodes.length > 1) {
    await patch.generateDescription();
  }
  
  return true;
}

/**
 * Remove an edge from a patch
 */
export async function removeEdge(patch: Patch, id: string): Promise<boolean> {
  // Call the removeEdge method on the patch instance
  return patch.removeEdge(id);
}