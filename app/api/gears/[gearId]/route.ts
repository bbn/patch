import { Gear } from "@/lib/models/Gear";

export const runtime = "edge";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gearId: string }> }
) {
  const { inputMessage } = await req.json();

  const gearId = (await params).gearId;

  const gear = await Gear.findById(gearId);
  if (!gear) {
    return new Response("Gear not found", { status: 404 });
  }

  const output = await gear.process(inputMessage);
  console.log(output);

  return Response.json({ output });
}
