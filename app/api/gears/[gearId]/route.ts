import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { Gear } from "@/lib/models/Gear";

export const runtime = "edge";

export async function POST(
  req: Request,
  { params }: { params: { gearId: string } },
) {
  const { inputMessage } = await req.json();

  const gearId = (await params).gearId;

  const gear = await Gear.findById(gearId);
  if (!gear) {
    return new Response("Gear not found", { status: 404 });
  }

  gear.inputMessage = JSON.stringify(inputMessage);
  await gear.save();

  const result = streamText({
    model: openai("gpt-4-turbo"),
    messages: [
      { role: "system", content: gear.systemPrompt },
      {
        role: "user",
        content: `Process this input: ${JSON.stringify(inputMessage)}`,
      },
    ],
  });

  return result.toDataStreamResponse();
}
