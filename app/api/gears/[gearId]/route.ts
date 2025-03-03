import { Gear } from "@/lib/models/Gear";

export const runtime = "edge";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gearId: string }> }
) {
  try {
    const resolvedParams = await params;
    console.log("Gear API called with gearId:", resolvedParams.gearId);
    const { message, source } = await req.json();
    const gearId = resolvedParams.gearId;

    // Try to find the gear, or create a new one if it doesn't exist
    let gear = await Gear.findById(gearId);
    
    if (!gear) {
      console.log("Gear not found, creating a new one with id:", gearId);
      // Create a new gear with this ID
      gear = await Gear.create({
        id: gearId,
        messages: [],
        outputUrls: []
      });
      
      if (!gear) {
        console.error("Failed to create gear:", gearId);
        return new Response("Failed to create gear", { status: 500 });
      }
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
