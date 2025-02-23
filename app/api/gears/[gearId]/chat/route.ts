import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Gear } from "@/lib/models/Gear";

export const runtime = "edge";

export async function POST(
  req: Request,
  { params }: { params: { gearId: string } },
) {
  const { messages } = await req.json();
  const gearId = params.gearId;

  const gear = await Gear.findById(gearId);
  if (!gear) {
    return new Response("Gear not found", { status: 404 });
  }

  const result = streamText({
    model: openai('gpt-4-turbo'),
    messages: [
      { role: 'system', content: gear.systemPrompt() },
      ...gear.messages,
      ...messages,
    ],
  });

  return result.toDataStreamResponse();
}