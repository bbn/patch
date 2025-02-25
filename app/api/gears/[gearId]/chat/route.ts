import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Gear, Message } from "@/lib/models/Gear";
import { NextRequest } from 'next/server';

export const runtime = "edge";

interface ChatRequestMessage {
  role: string;
  content: string;
  id?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gearId: string }> }
) {
  const { messages }: { messages: ChatRequestMessage[] } = await request.json();
  const gearId = (await params).gearId;

  const gear = await Gear.findById(gearId);
  if (!gear) {
    return new Response("Gear not found", { status: 404 });
  }

  const result = streamText({
    model: openai('gpt-4-turbo'),
    messages: [
      { role: 'system' as const, content: gear.systemPrompt() },
      ...gear.messages.map((msg: Message) => ({ 
        role: msg.role as "system" | "user" | "assistant" | "data", 
        content: msg.content 
      })),
      ...messages.map((msg: ChatRequestMessage) => ({ 
        role: msg.role as "system" | "user" | "assistant" | "data", 
        content: msg.content 
      })),
    ],
  });

  // Return the result as a streaming response
  return result.toDataStreamResponse();
}