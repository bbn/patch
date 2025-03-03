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
