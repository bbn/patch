import { Patch } from './Patch';
import { PatchNode } from './types';

/**
 * Add a node to a patch
 */
export async function addNode(patch: Patch, node: PatchNode, skipSave = false): Promise<void> {
  patch.nodes.push(node);
  
  // Generate a new description when node is added, as functionality might change
  await patch.generateDescription(true); // Skip saving after description generation
  
  if (!skipSave) {
    await patch.save();
  }
}

/**
 * Update a node in a patch
 */
export async function updateNode(patch: Patch, id: string, updates: Partial<PatchNode>): Promise<boolean> {
  const nodeIndex = patch.nodes.findIndex(node => node.id === id);
  if (nodeIndex === -1) return false;
  
  // Check if the gearId is changing - this would change functionality
  const isChangingGear = updates.data?.gearId && 
    updates.data.gearId !== patch.nodes[nodeIndex].data.gearId;
  
  patch.nodes[nodeIndex] = {
    ...patch.nodes[nodeIndex],
    ...updates,
  };
  
  // If changing the gear, update the description
  if (isChangingGear) {
    await patch.generateDescription();
  }
  
  await patch.save();
  return true;
}

/**
 * Remove a node from a patch
 */
export async function removeNode(patch: Patch, id: string): Promise<boolean> {
  // Call the removeNode method on the patch instance
  return patch.removeNode(id);
}