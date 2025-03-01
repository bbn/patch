import { Gear } from "@/lib/models/Gear";

export const runtime = "edge";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gearId: string }> }
) {
  try {
    const { message, source } = await req.json();
    const gearId = (await params).gearId;

    const gear = await Gear.findById(gearId);
    if (!gear) {
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
