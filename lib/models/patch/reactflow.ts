import { Patch } from './Patch';
import { Gear } from '../gear';

/**
 * Import data from ReactFlow format
 */
export async function updateFromReactFlow(patch: Patch, reactFlowData: { nodes: any[]; edges: any[] }): Promise<void> {
  // Call patch's native method
  await patch.updateFromReactFlow(reactFlowData);
}