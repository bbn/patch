/**
 * @deprecated This file is a pass-through for the new modular Patch implementation.
 * Please update imports to use the new structure:
 * import { Patch, ... } from './models/patch';
 */

// Export directly from the implementation file to ensure all methods are available
export { Patch } from './patch/Patch';
export * from './patch/types';

// Export the node and edge operations directly
export { 
  addNode, 
  updateNode, 
  removeNode 
} from './patch/nodes';

export { 
  addEdge,
  updateEdge,
  removeEdge
} from './patch/edges';

export { 
  updateFromReactFlow 
} from './patch/reactflow';

export {
  deleteById as deletePatchById,
  findAll as findAllPatches,
  subscribeToAll as subscribeToAllPatches,
  generateAllDescriptions as generateAllPatchDescriptions
} from './patch/utils';

// Include necessary types from the original module
export type {
  PatchNode,
  PatchEdge,
  PatchData
} from './patch/types';