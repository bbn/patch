import { Gear } from "@/lib/models/Gear";

export const runtime = "edge";

export async function GET() {
  try {
    console.log("Listing all gears");
    const gears = await Gear.findAll();
    
    // Map to a simplified representation
    const simplified = gears.map(gear => ({
      id: gear.id,
      outputUrls: gear.outputUrls,
      createdAt: gear.createdAt,
      updatedAt: gear.updatedAt,
      messageCount: gear.messages.length
    }));
    
    return Response.json(simplified);
  } catch (error) {
    console.error("Error listing gears:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}