import { Gear } from "@/lib/models/Gear";
import { Message, Role } from "@/lib/models/types";

export const runtime = "edge";

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
  try {
    const resolvedParams = await params;
    console.log("Gear API called with gearId:", resolvedParams.gearId);
    const { message, source } = await req.json();
    const gearId = resolvedParams.gearId;

    // Try to find the gear
    let gear = await Gear.findById(gearId);
    
    if (!gear) {
      console.log("Gear not found:", gearId);
      return new Response("Gear not found", { status: 404 });
    }

    const output = await gear.processInput(source, message);
    
    return Response.json({ output });
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
    return Response.json({
      id: gear.id,
      messages: gear.messages,
      outputUrls: gear.outputUrls,
      createdAt: gear.createdAt,
      updatedAt: gear.updatedAt,
      exampleInputs: gear.exampleInputs,
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
    
    if (updates.messages) {
      console.log(`PUT API: Updating messages for gear ${gearId}`);
      // Replace messages using setter method
      await gear.setMessages(processMessages(updates.messages));
      updated = true;
    }
    
    if (updates.outputUrls) {
      console.log(`PUT API: Updating outputUrls for gear ${gearId}`);
      // Replace output URLs using setter method
      await gear.setOutputUrls(updates.outputUrls);
      updated = true;
    }
    
    if (updates.exampleInputs) {
      console.log(`PUT API: Updating exampleInputs for gear ${gearId}`);
      // Replace example inputs using setter method
      await gear.setExampleInputs(updates.exampleInputs);
      updated = true;
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