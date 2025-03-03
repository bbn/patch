import { openai } from '@ai-sdk/openai';
import { createIdGenerator, streamText } from 'ai';
import { Gear } from "@/lib/models/Gear";
import { GearChat } from "@/lib/models/GearChat";
import { NextRequest } from 'next/server';

export const runtime = "edge";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gearId: string }> }
) {
  try {
    const resolvedParams = await params;
    console.log("Chat API called with gearId:", resolvedParams.gearId);
    const { messages } = await request.json();
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

    // Create GearChat instance
    const gearChat = new GearChat(gear.messages, gearId);
    
    // Add the latest user message to GearChat
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage && lastUserMessage.role === "user") {
      await gearChat.addMessage({
        role: lastUserMessage.role,
        content: lastUserMessage.content
      });
    }

    // Prepare the messages array with system prompt
    const allMessages = [
      { role: 'system' as const, content: gear.systemPrompt() },
      ...gearChat.getMessages().map((msg) => ({ 
        role: msg.role as "system" | "user" | "assistant" | "data", 
        content: msg.content 
      })),
      // Include the latest user message
      ...(messages || []),
    ];

    console.log("Processing chat with messages:", JSON.stringify(allMessages));

    const result = streamText({
      model: openai('gpt-4-turbo'),
      messages: allMessages,
      // Create consistent IDs for messages
      experimental_generateMessageId: createIdGenerator({
        prefix: 'gear',
        size: 16,
      }),
      async onFinish({ response }) {
        // Add the assistant response to the GearChat
        const assistantMessage = response.messages.find(msg => msg.role === "assistant");
        if (assistantMessage) {
          await gearChat.addMessage({
            role: "assistant",
            content: typeof assistantMessage.content === 'string' 
              ? assistantMessage.content 
              : JSON.stringify(assistantMessage.content)
          });
        }
        
        // Note: If you need to add all messages back to a storage system,
        // you could use appendResponseMessages here
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Error in chat API:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}