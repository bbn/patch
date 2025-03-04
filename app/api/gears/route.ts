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

// Get all gears
export async function GET() {
  try {
    const gears = await Gear.findAll();
    
    // Map to a simple response format
    const gearsResponse = gears.map(gear => ({
      id: gear.id,
      createdAt: gear.createdAt,
      updatedAt: gear.updatedAt,
      messageCount: gear.messages.length,
      outputCount: gear.outputUrls.length,
      exampleCount: gear.exampleInputs.length
    }));
    
    return Response.json(gearsResponse);
  } catch (error) {
    console.error("Error listing all gears:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Create a new gear
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    if (!body.id) {
      return Response.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }
    
    // Check if gear already exists
    const existingGear = await Gear.findById(body.id);
    if (existingGear) {
      console.log(`Gear ${body.id} already exists`);
      return Response.json(
        { error: "Gear with this ID already exists" },
        { status: 409 }
      );
    }
    
    // Create the gear with processed messages to ensure type safety
    const gear = await Gear.create({
      id: body.id,
      messages: processMessages(body.messages || []),
      outputUrls: Array.isArray(body.outputUrls) ? body.outputUrls : [],
      exampleInputs: Array.isArray(body.exampleInputs) ? body.exampleInputs : []
    });
    
    return Response.json({
      id: gear.id,
      created: true
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating gear:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}