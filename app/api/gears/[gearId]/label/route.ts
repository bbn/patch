import { openai } from '@ai-sdk/openai';
import { createIdGenerator, streamText } from 'ai';
import { Gear } from "@/lib/models/Gear";
import { NextRequest } from 'next/server';

export const runtime = "edge";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gearId: string }> }
) {
  try {
    const resolvedParams = await params;
    console.log("Label API called with gearId:", resolvedParams.gearId);
    const gearId = resolvedParams.gearId;
    const { prompt } = await request.json();

    // Try to find the gear
    const gear = await Gear.findById(gearId);
    
    if (!gear) {
      console.log("Label API: Gear not found:", gearId);
      return new Response("Gear not found", { status: 404 });
    }
    
    console.log(`Label API: Found gear with ${gear.messages.length} messages`);

    // Process the label generation request
    console.log("Processing label generation request");
    
    const result = await streamText({
      model: openai('gpt-4o-mini'), // Using a smaller model for label generation is sufficient
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      experimental_generateMessageId: createIdGenerator({
        prefix: 'label',
        size: 16,
      }),
    });
    
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Error in label API:", error);
    
    // Extract the actual error message
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return Response.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}