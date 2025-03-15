import { Gear } from "@/lib/models/Gear";
import { Message, Role } from "@/lib/models/types";
import { debugLog } from "@/lib/utils";

export const runtime = "nodejs";

// Utility function to ensure role has valid type
function validateRole(role: any): Role {
  const validRoles: Role[] = ["user", "assistant", "system"];
  return validRoles.includes(role) ? role : "user";
}

// Process messages to ensure they have valid roles
function processMessages(messages: any[]): Message[] {
  if (!Array.isArray(messages)) return [];
  
  return messages.map(msg => ({
    id: msg.id || crypto.randomUUID(),
    role: validateRole(msg.role),
    content: String(msg.content || "")
  }));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gearId: string }> }
) {
  // In the latest Next.js, background tasks need to run after returning response
  // We'll handle this differently
  try {
    const resolvedParams = await params;
    console.log("Gear API called with gearId:", resolvedParams.gearId);
    
    // Check query parameters using positive flags
    const url = new URL(req.url);
    
    // Support both negative and positive flags for forward parameter (prefer positive)
    const forwardParam = url.searchParams.get('forward');
    const noForwardParam = url.searchParams.get('no_forward');
    // Default to true, explicitly set to false only when forward=false or no_forward=true
    const shouldForward = forwardParam !== 'false' && noForwardParam !== 'true';
    
    // Support both negative and positive flags for log parameter (prefer positive)
    const createLogParam = url.searchParams.get('create_log');
    const noLogParam = url.searchParams.get('no_log');
    // Default to true, explicitly set to false only when create_log=false or no_log=true
    const shouldCreateLog = createLogParam !== 'false' && noLogParam !== 'true';
    
    const requestBody = await req.json();
    const gearId = resolvedParams.gearId;

    // Handle both the new format and legacy format for backward compatibility
    let message, source, sourceLabel;
    
    // Only log essential info for production, detailed logs in debug mode
    console.log(`Processing gear ${gearId} request`);
    
    // Debug log the incoming request for troubleshooting (only in debug mode)
    debugLog("API", `[${gearId}] Incoming request`);
    debugLog("API", `[${gearId}] Request body: ${JSON.stringify(requestBody, null, 2)}`);
    debugLog("API", `[${gearId}] Query params: forward=${shouldForward}, create_log=${shouldCreateLog}`);
    debugLog("API", `[${gearId}] URL: ${req.url}`);
    
    if (requestBody.data !== undefined && requestBody.source_gear !== undefined) {
      // New format - receiving a forwarded message from another gear
      message = requestBody.data;
      source = requestBody.source_gear.id || 'unknown';
      sourceLabel = requestBody.source_gear.label || source;
      console.log(`Received message for gear ${gearId} from source gear "${sourceLabel}"`);
      debugLog("API", `[${gearId}] Full source details: gear "${sourceLabel}" (${source})`);
    } else {
      // Legacy format - direct input not being forwarded
      message = requestBody.message;
      source = requestBody.source || 'direct';
      sourceLabel = source;
      console.log(`Received message for gear ${gearId} from source: ${source}`);
      debugLog("API", `[${gearId}] Legacy source format: ${source}`);
    }

    // Try to find the gear
    let gear = await Gear.findById(gearId);
    
    if (!gear) {
      console.log("Gear not found:", gearId);
      return new Response("Gear not found", { status: 404 });
    }

    // Process the input
    const output = await gear.process(message);
    
    // Output is already stored in gear.data.output by the process method
    
    // Create a log entry based on shouldCreateLog flag
    if (shouldCreateLog) {
      // Create source object
      const sourceObj = sourceLabel 
        ? { id: source, label: sourceLabel } 
        : source;
      
      console.log(`Creating log entry for gear ${gearId}`);
      debugLog("API", `[${gearId}] Creating log entry from source ${JSON.stringify(sourceObj)}`);
      
      try {
        // Create a log entry for the PUT request to handle
        const logEntry = {
          timestamp: Date.now(),
          input: message,
          output,
          source: sourceObj
        };
        
        // Update the gear via PUT request to itself to add the log entry
        const currentLog = gear.log || [];
        const updatedLog = [logEntry, ...currentLog].slice(0, 50); // Keep only 50 entries
        
        // Update using the Edit method
        await fetch(`/api/gears/${gearId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            log: updatedLog
          }),
        });
        
        debugLog("API", `[${gearId}] Created log entry (log count: ${updatedLog.length})`);
        
        // Only run validation in debug mode
        if (updatedLog.length === 0) {
          console.error(`ERROR: Log array is still empty after adding entry!`);
        } else {
          debugLog("API", `[${gearId}] Latest log entry timestamp: ${updatedLog[0].timestamp}`);
        }
      } catch (logError) {
        console.error(`Error creating log entry:`, logError);
      }
    } else {
      debugLog("API", `[${gearId}] Skipping log creation (create_log=false)`);
    }
    
    // Save the gear with the updated output
    console.log(`Saving gear ${gearId}`);
    try {
      await gear.save();
      debugLog("API", `[${gearId}] Successfully saved gear`);
      
      // Only verify in debug mode to avoid extra database ops in production
      if (debugLog !== console.log) {
        const verifyGear = await Gear.findById(gearId);
        if (verifyGear) {
          debugLog("API", `[${gearId}] Verified saved gear has ${verifyGear.log.length} log entries`);
        } else {
          console.error(`ERROR: Could not verify gear was saved!`);
        }
      }
    } catch (saveError) {
      console.error(`Error saving gear:`, saveError);
    }
    
    // Prepare response
    const response = Response.json({ output });
    
    // Forward output based on shouldForward flag
    if (shouldForward && gear.outputUrls?.length > 0) {
      console.log(`Forwarding output to ${gear.outputUrls.length} connected gears`);
      
      // In Edge Runtime, we need to just start the processing without waiting
      // We'll fire and forget, letting the runtime handle background work
      // This is not ideal but needed as a workaround for current Next.js Edge API
      (async () => {
        try {
          debugLog("API", `[${gearId}] Starting async forwarding...`);
          await gear.forwardOutputToGears(output);
          debugLog("API", `[${gearId}] Successfully completed async forwarding`);
        } catch (forwardError) {
          console.error(`Error in async forwarding:`, forwardError);
        }
      })();
      
      debugLog("API", `[${gearId}] Forwarding started asynchronously`);
    } else if (!shouldForward) {
      debugLog("API", `[${gearId}] Not forwarding (forward=false)`);
    } else {
      debugLog("API", `[${gearId}] No output URLs to forward to`);
    }
    
    // Return the prepared response
    return response;
  } catch (error) {
    console.error("Error processing gear input:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Get a specific gear
export async function GET(
  req: Request,
  { params }: { params: Promise<{ gearId: string }> }
) {
  try {
    const resolvedParams = await params;
    const gearId = resolvedParams.gearId;
    
    console.log(`GET request for gear: ${gearId}`);
    
    // Try to find the gear
    const gear = await Gear.findById(gearId);
    
    if (!gear) {
      console.log(`GET API: Gear ${gearId} not found`);
      return new Response("Gear not found", { status: 404 });
    }
    
    console.log(`GET API: Found gear ${gearId}`);
    
    // Add logging for the label being sent to client
    console.log(`GET API: Sending gear label: "${gear.label}" (length: ${gear.label.length})`);
    
    return Response.json({
      id: gear.id,
      messages: gear.messages,
      outputUrls: gear.outputUrls,
      createdAt: gear.createdAt,
      updatedAt: gear.updatedAt,
      exampleInputs: gear.exampleInputs,
      label: gear.label,
      log: gear.log,
    });
  } catch (error) {
    console.error("Error getting gear:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Update a gear
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ gearId: string }> }
) {
  try {
    const resolvedParams = await params;
    const gearId = resolvedParams.gearId;
    const updates = await req.json();
    
    console.log(`PUT request for gear: ${gearId}`);
    
    // Try to find the gear
    let gear = await Gear.findById(gearId);
    
    if (!gear) {
      console.log(`PUT API: Gear ${gearId} not found`);
      return new Response("Gear not found", { status: 404 });
    }
    
    // Apply updates
    let updated = false;
    
    // Track if we need to update patches after all changes
    let needsPatchUpdate = false;
    
    // Temporarily disable patch description updates during batch operations
    gear.skipDescriptionUpdates = true;
    
    // Start a batch update to collect all changes before saving
    gear.startBatchUpdate();
    
    if (updates.messages) {
      console.log(`PUT API: Updating messages for gear ${gearId}`);
      // Process messages but don't trigger patch updates yet
      await gear.setMessages(processMessages(updates.messages), true);
      updated = true;
      needsPatchUpdate = true;
    }
    
    if (updates.outputUrls) {
      console.log(`PUT API: Updating outputUrls for gear ${gearId}`);
      // Replace output URLs using setter method - skip individual save
      await gear.setOutputUrls(updates.outputUrls, true);
      updated = true;
    }
    
    if (updates.exampleInputs) {
      console.log(`PUT API: Updating exampleInputs for gear ${gearId}`);
      // Replace example inputs using setter method - skip individual save
      await gear.setExampleInputs(updates.exampleInputs, true);
      updated = true;
    }
    
    if (updates.label !== undefined) {
      // Only log and update if the label is actually changing
      if (gear.label !== updates.label) {
        console.log(`PUT API: Updating label for gear ${gearId} from "${gear.label}" to "${updates.label}"`);
        
        // Update the label but don't trigger patch updates yet or individual save
        await gear.setLabel(updates.label, true);
        updated = true;
        needsPatchUpdate = true;
      } else {
        console.log(`PUT API: Label unchanged for gear ${gearId}, skipping update`);
      }
    }
    
    if (updates.log !== undefined) {
      console.log(`PUT API: Updating log for gear ${gearId}`);
      // Use the new setLog method - skip individual save
      await gear.setLog(updates.log, true);
      updated = true;
    }
    
    // Complete the batch update to save all changes at once
    // Force a save even if pendingChanges isn't set
    await gear.completeBatchUpdate(true);
    
    // Re-enable patch updates and do a single update if needed
    gear.skipDescriptionUpdates = false;
    
    if (needsPatchUpdate) {
      console.log(`PUT API: Performing a single patch description update`);
      await gear.updateContainingPatchDescriptions();
    }
    
    if (updated) {
      console.log(`PUT API: Successfully updated gear ${gearId}`);
    } else {
      console.log(`PUT API: No changes to update for gear ${gearId}`);
    }
    
    return Response.json({
      id: gear.id,
      updated
    });
  } catch (error) {
    console.error("Error updating gear:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}