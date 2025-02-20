import { kv } from "@vercel/kv";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export const runtime = "edge";

export async function POST(
  req: Request,
  { params }: { params: { gearId: string } },
) {
  const { inputMessage } = await req.json();
  const gearId = params.gearId;
  const gear = await kv.get<Gear>(gearId);

  // Retrieve gear data from Vercel KV
  const gearData = await kv.get(`gear:${gearId}`);
  const systemPrompt = gearData?.systemPrompt || "You are a helpful assistant.";

  const result = streamText({
    model: openai("gpt-4-turbo"),
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Process this input: ${JSON.stringify(inputMessage)}`,
      },
    ],
  });

  return result.toDataStreamResponse();

  // return status code 202 for accpeting the request for an async job
}
