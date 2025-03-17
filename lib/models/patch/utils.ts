import { getDatabase } from '../../database';
import { collection, onSnapshot } from 'firebase/firestore';
import { db as firestoreDb } from '../../firebase';
import { Patch } from './Patch';
import { PatchData } from './types';
import { Gear } from '../gear';

// Get the appropriate database implementation based on environment
const database = getDatabase();

/**
 * Delete a patch by ID including its associated gears
 */
export async function deleteById(id: string): Promise<boolean> {
  // This method requires different behavior on client and server
  if (typeof window !== 'undefined') {
    // Client-side: Use the API endpoint to trigger cascade deletion
    try {
      console.log(`Calling API to delete patch ${id} and associated gears`);
      const response = await fetch(`/api/patches/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error response from patch deletion API: ${response.status} ${errorText}`);
        throw new Error(`HTTP error deleting patch! status: ${response.status} - ${errorText}`);
      }
      
      console.log(`Successfully deleted patch ${id} via API`);
      return true;
    } catch (error) {
      console.error(`Error deleting patch ${id}:`, error);
      return false;
    }
  } else {
    // Server-side: Handle cascade deletion logic
    try {
      // Get the patch
      const patch = await Patch.findById(id);
      if (!patch) {
        console.log(`Patch ${id} not found for deletion`);
        return false;
      }
      
      // Extract all gear IDs from the nodes
      const gearIds = patch.nodes.map(node => node.data.gearId);
      
      // Log how many gears will be deleted
      console.log(`Deleting patch ${id} with ${gearIds.length} associated gears`);
      
      // Delete each gear and track any failures
      const deletionResults = await Promise.allSettled(
        gearIds.map(gearId => Gear.deleteById(gearId))
      );
      
      // Log any failures, but continue with patch deletion
      let failureCount = 0;
      deletionResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          failureCount++;
          console.error(`Failed to delete gear ${gearIds[index]}:`, result.reason);
        } else if (!result.value) {
          failureCount++;
          console.warn(`Gear ${gearIds[index]} could not be deleted or was not found`);
        }
      });
      
      if (failureCount > 0) {
        console.warn(`${failureCount} out of ${gearIds.length} gears failed to delete. Continuing with patch deletion.`);
      }
      
      // Delete the patch itself using our database abstraction
      const deleted = await database.deletePatch(id);
      
      if (deleted) {
        console.log(`Successfully deleted patch ${id} along with ${gearIds.length - failureCount} gears`);
      } else {
        console.error(`Failed to delete patch ${id} after deleting gears`);
      }
      
      return deleted;
    } catch (error) {
      console.error(`Error during cascade deletion of patch ${id}:`, error);
      
      // Attempt to delete the patch anyway, even if gear deletion had errors
      try {
        console.log(`Attempting to delete patch ${id} despite errors with gear deletion`);
        const deleted = await database.deletePatch(id);
        if (deleted) {
          console.log(`Deleted patch ${id} despite gear deletion errors`);
        } else {
          console.error(`Failed to delete patch ${id} after gear deletion errors`);
        }
        return deleted;
      } catch (kvError) {
        console.error(`Failed to delete patch ${id}:`, kvError);
        return false;
      }
    }
  }
}

/**
 * Get all patches from the store
 */
export async function findAll(): Promise<Patch[]> {
  try {
    const patchDataList = await database.getAllPatches();
    return patchDataList.map((patchData) => {
      // Ensure the data has the required properties for PatchData
      return new Patch({
        id: patchData.id as string,
        name: patchData.name as string,
        nodes: patchData.nodes || [],
        edges: patchData.edges || [],
        ...(patchData as Partial<PatchData>)
      });
    });
  } catch (error) {
    console.error("Error fetching patches:", error);
    return [];
  }
}

/**
 * Subscribe to real-time updates for all patches
 * This should be called on client-side only
 */
export function subscribeToAll(callback: (patches: Patch[]) => void): () => void {
  if (typeof window === 'undefined') {
    console.warn('subscribeToAll should only be called on the client side');
    return () => {};
  }

  // Create a new subscription to the patches collection
  const patchesRef = collection(firestoreDb, 'patches');
  const unsubscribe = onSnapshot(patchesRef, (querySnapshot) => {
    const patches: Patch[] = [];
    querySnapshot.forEach((doc) => {
      patches.push(new Patch(doc.data() as PatchData));
    });
    callback(patches);
  }, (error) => {
    console.error('Error in real-time updates for all patches:', error);
  });

  // Return the unsubscribe function
  return unsubscribe;
}

/**
 * Generate descriptions for all patches in the system
 * This is useful when introducing the description feature to ensure all patches have descriptions.
 */
export async function generateAllDescriptions(): Promise<number> {
  console.log("Generating descriptions for all patches...");
  
  // Load all patches
  const patches = await findAll();
  console.log(`Found ${patches.length} patches to process`);
  
  let successCount = 0;
  
  // Process each patch
  for (const patch of patches) {
    if (patch.nodes.length > 0) {
      try {
        console.log(`Generating description for patch ${patch.id}: ${patch.name}`);
        await patch.generateDescription();
        await patch.save();
        successCount++;
      } catch (error) {
        console.error(`Error generating description for patch ${patch.id}:`, error);
      }
    } else {
      console.log(`Skipping patch ${patch.id} with no nodes`);
    }
  }
  
  console.log(`Successfully updated descriptions for ${successCount} patches`);
  return successCount;
}