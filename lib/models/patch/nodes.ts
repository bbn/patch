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
  const initialLength = patch.nodes.length;
  patch.nodes = patch.nodes.filter(node => node.id !== id);
  
  // Also remove any edges connected to this node
  patch.edges = patch.edges.filter(
    edge => edge.source !== id && edge.target !== id
  );
  
  // Generate a new description when nodes are removed, as functionality might change
  if (patch.nodes.length < initialLength) {
    await patch.generateDescription();
  }
  
  await patch.save();
  return patch.nodes.length < initialLength;
}