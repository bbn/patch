import { Gear } from "./Gear";
import { GearOutput } from "../types";
import { debugLog } from "../../utils";

/**
 * Forward output to connected gears
 * This handles the communication between gears in the patch
 */
export async function forwardOutputToGears(gear: Gear, output: GearOutput): Promise<void> {
  // Debug log the output type and structure to help diagnose issues
  console.log(`forwardOutputToGears called for gear ${gear.id} with output type ${typeof output}`);
  if (typeof output === 'string') {
    console.log(`Output preview: ${output.substring(0, 50)}...`);
  } else if (output) {
    console.log(`Output preview: ${JSON.stringify(output).substring(0, 50)}...`);
  }
  
  // If there are no output gears, just return early
  if (!gear.outputUrls || gear.outputUrls.length === 0) {
    return;
  }
  
  // Log essential information
  console.log(`Forwarding from gear ${gear.id} to ${gear.outputUrls.length} connected gears`);
  
  // Additional debug information
  debugLog("FORWARDING", `Gear ${gear.id} outputUrls: ${JSON.stringify(gear.outputUrls)}`);
  
  for (const url of gear.outputUrls) {
    const newMessageId = crypto.randomUUID();
    try {
      // Ensure the URL is absolute by checking if it's a relative URL
      let fullUrl = url;
      
      // REMOVE any /process suffix if it exists
      if (fullUrl.endsWith('/process')) {
        fullUrl = fullUrl.substring(0, fullUrl.length - 8); // Remove "/process" 
        debugLog("FORWARDING", `Removing "/process" suffix: ${url} -> ${fullUrl}`);
      }
      
      // For all forwarding, ensure logs are created
      if (fullUrl.includes('no_log=true')) {
        // Replace no_log=true with create_log=true
        fullUrl = fullUrl.replace('no_log=true', 'create_log=true');
        debugLog("FORWARDING", `Fixed URL to enable logs: ${fullUrl}`);
      } else if (fullUrl.includes('create_log=false')) {
        // Replace create_log=false with create_log=true
        fullUrl = fullUrl.replace('create_log=false', 'create_log=true');
        debugLog("FORWARDING", `Fixed URL to enable logs: ${fullUrl}`);
      } else if (!fullUrl.includes('create_log=true')) {
        // Add parameter to enable log creation if not already there
        fullUrl += (fullUrl.includes('?') ? '&' : '?') + 'create_log=true';
        debugLog("FORWARDING", `Adding parameter to enable logs: ${fullUrl}`);
      }
      
      debugLog("FORWARDING", `Gear ${gear.id} forwarding to URL: ${fullUrl}`);
      
      // Edge Runtime requires absolute URLs for fetch
      if (fullUrl.startsWith('/')) {
        // For browser context, use window.location
        if (typeof window !== 'undefined') {
          fullUrl = `${window.location.origin}${fullUrl}`;
          debugLog("FORWARDING", `Client-side URL: ${fullUrl}`);
        } else {
          // In server context (edge runtime) we must use absolute URLs
          // Try to get from env vars first, fallback to localhost for development
          const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3333';
          fullUrl = `${baseURL}${fullUrl}`;
          debugLog("FORWARDING", `Server-side absolute URL: ${fullUrl}`);
        }
      }
      
      try {
        // Only critical logs in production, details in debug mode
        debugLog("FORWARDING", `Sending request to ${fullUrl}`);
        
        // Each gear is the source for its own forwarded messages
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_gear: {
              id: gear.id,
              label: gear.label
            },
            message_id: newMessageId,
            data: output,
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error response from ${fullUrl}: ${response.status} ${errorText}`);
          throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        } else {
          debugLog("FORWARDING", `Successfully forwarded from ${gear.id} to ${fullUrl}`);
        }
      } catch (fetchError) {
        // Log the detailed error for debugging
        console.error(`Fetch error for ${fullUrl}:`, fetchError);
        
        // Fall back to log the error and continue with other URLs
        debugLog("FORWARDING", `Will continue with other URLs despite error`);
      }
    } catch (error) {
      console.error(`Error forwarding from ${gear.id} to ${url}:`, error);
    }
  }
}

/**
 * Add an output URL to a gear's connections
 */
export async function addOutputUrl(gear: Gear, url: string, skipSave = false): Promise<boolean> {
  // Check if URL already exists to avoid unnecessary updates
  const urlExists = gear.outputUrls.includes(url);
  if (!urlExists) {
    console.log(`Adding URL ${url} to gear ${gear.id}`);
    gear.data.outputUrls.push(url);
    if (!skipSave) {
      await gear.save();
    }
  }
  
  return !urlExists; // Return true if we added the URL
}

/**
 * Remove an output URL from a gear's connections
 */
export async function removeOutputUrl(gear: Gear, url: string, skipSave = false): Promise<boolean> {
  // Check if URL actually exists to avoid unnecessary updates
  const initialLength = gear.outputUrls.length;
  gear.data.outputUrls = gear.outputUrls.filter((u) => u !== url);
  
  // Only save if there was an actual change
  if (initialLength !== gear.outputUrls.length && !skipSave) {
    console.log(`Removed URL ${url} from gear ${gear.id}`);
    await gear.save();
  }
  
  return initialLength !== gear.outputUrls.length;
}

/**
 * Updates the descriptions of all patches containing this gear.
 * This is triggered after significant changes to the gear.
 */
export async function updateContainingPatchDescriptions(gear: Gear, specificPatchId?: string): Promise<void> {
  // Skip this entirely on initial creation or when running server-side
  if (typeof window === 'undefined' || gear.skipDescriptionUpdates) {
    return;
  }

  try {
    // If a specific patch ID is provided, only update that one
    if (specificPatchId) {
      console.log(`Updating description for specific patch ${specificPatchId}`);
      await fetch(`/api/patches/${specificPatchId}/description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return;
    }
    
    // Use a single request to get all patches in a compact format
    const response = await fetch('/api/patches');
    if (!response.ok) return;
    
    const patches = await response.json();
    
    // Find patches containing this gear by ID more efficiently
    const batchPromises: Promise<void>[] = [];
    const patchesToUpdate: string[] = [];
    
    for (const patchData of patches) {
      batchPromises.push(
        (async () => {
          try {
            const patchResponse = await fetch(`/api/patches/${patchData.id}`);
            if (!patchResponse.ok) return;
            
            const fullPatchData = await patchResponse.json();
            
            // Check if any nodes in this patch use this gear
            const containsThisGear = fullPatchData.nodes?.some(
              (node: any) => node.data?.gearId === gear.id
            );
            
            if (containsThisGear) {
              patchesToUpdate.push(patchData.id);
            }
          } catch (error) {
            console.error(`Error checking patch ${patchData.id} for gear:`, error);
          }
        })()
      );
    }
    
    // Wait for all checks to complete
    await Promise.all(batchPromises);
    
    // Now update descriptions in batch
    if (patchesToUpdate.length > 0) {
      console.log(`Updating descriptions for ${patchesToUpdate.length} patches containing gear ${gear.id}`);
      
      // Update descriptions in parallel
      await Promise.all(
        patchesToUpdate.map(patchId => 
          fetch(`/api/patches/${patchId}/description`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          })
        )
      );
    }
  } catch (error) {
    console.error("Error updating patch descriptions after gear changes:", error);
  }
}