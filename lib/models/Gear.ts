/**
 * @deprecated This file is a pass-through for the new modular Gear implementation.
 * Please update imports to use the new structure:
 * import { Gear, ... } from './models/gear';
 */

// Export directly from the implementation file to ensure all methods are available
export { Gear } from './gear/Gear';
export * from './gear/types';

// Include necessary types from the original module
export type {
  ExampleInput,
  GearSource,
  GearLogEntry,
  GearData
} from './gear/types';