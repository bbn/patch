import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { Gear } from "@/lib/models/Gear";
import { NextRequest } from 'next/server';

export const runtime = "nodejs";

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
    
    // Since label generation doesn't require streaming, we can use generateText
    // But we'll format the response to match what the Gear.processWithSpecialPrompt method expects
    const result = await generateText({
      model: openai('gpt-4o-mini'), // Using a smaller model for label generation is sufficient
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });
    
    // Return just the raw text - this is what Gear.processWithSpecialPrompt expects
    return Response.json({ text: result.text });
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