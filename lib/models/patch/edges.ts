import { Patch } from './Patch';
import { PatchEdge } from './types';
import { Gear } from '../gear';

/**
 * Add an edge to a patch
 */
export async function addEdge(patch: Patch, edge: PatchEdge): Promise<void> {
  console.log(`Adding edge from ${edge.source} to ${edge.target}`);
  
  // Check if edge already exists to avoid duplicates
  const edgeExists = patch.edges.some(e => 
    e.source === edge.source && e.target === edge.target);
    
  if (edgeExists) {
    console.log(`Edge already exists from ${edge.source} to ${edge.target}, skipping`);
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
          console.error("Error updating gear connections via API:", error);
        }
      }
    }
  } catch (error) {
    console.error("Error updating gear connections:", error);
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
  console.log(`Updating edge ${id}`);
  
  const edgeIndex = patch.edges.findIndex(edge => edge.id === id);
  if (edgeIndex === -1) {
    console.log(`Edge ${id} not found`);
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
    console.log(`Edge connections are changing from ${oldEdge.source}->${oldEdge.target} to ${newSourceId}->${newTargetId}`);
    
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
      console.error("Error updating gear connections:", error);
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
  const edgeToRemove = patch.edges.find(edge => edge.id === id);
  if (!edgeToRemove) return false;
  
  // First update the edge list without saving
  const initialLength = patch.edges.length;
  patch.edges = patch.edges.filter(edge => edge.id !== id);
  
  if (patch.edges.length >= initialLength) {
    console.log(`No edge with ID ${id} found in patch ${patch.id}`);
    return false;
  }
  
  // Use batch updates for the source gear to avoid multiple API calls
  try {
    const sourceNode = patch.nodes.find(node => node.id === edgeToRemove.source);
    const targetNode = patch.nodes.find(node => node.id === edgeToRemove.target);
    
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
    await patch.save();
    
    // Only generate description if we actually removed an edge and have more than one node
    if (patch.nodes.length > 1) {
      // Generate a new description when an edge is removed, as it changes the functionality
      await patch.generateDescription();
    }
    
    return true;
  } catch (error) {
    console.error(`Error removing edge ${id}:`, error);
    // Still save the edge change even if gear update failed
    await patch.save();
    return true;
  }
}