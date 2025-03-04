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
    const { messages, special } = await request.json();
    const gearId = resolvedParams.gearId;

    // Try to find the gear
    const gear = await Gear.findById(gearId);
    
    if (!gear) {
      console.log("Chat API: Gear not found:", gearId);
      return new Response("Gear not found", { status: 404 });
    }
    
    console.log(`Chat API: Found gear with ${gear.messages.length} messages`);

    // Special requests are now deprecated - we have a separate label endpoint
    if (special === true) {
      console.warn("WARNING: Using deprecated 'special' flag in chat API. Use the dedicated /label endpoint instead.");
      
      // Keep this for backward compatibility, but log the warning
      const result = await streamText({
        model: openai('gpt-4o-mini'),
        messages: messages,
        experimental_generateMessageId: createIdGenerator({
          prefix: 'special',
          size: 16,
        }),
      });
      
      return result.toDataStreamResponse();
    }

    // Normal chat flow - not a special request
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
    
    console.log(`Chat API: Sending ${allMessages.length} messages to LLM`);

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
          let content = "";
          
          // Safely handle different types of content
          if (typeof assistantMessage.content === 'string') {
            content = assistantMessage.content;
          } else if (Array.isArray(assistantMessage.content)) {
            // For content arrays (e.g. with function calls), extract text parts
            content = assistantMessage.content
              .filter(part => part.type === 'text')
              .map(part => part.text)
              .join('');
          } else if (assistantMessage.content && typeof assistantMessage.content === 'object') {
            // Try to safely stringify the object
            try {
              content = JSON.stringify(assistantMessage.content);
            } catch (e) {
              console.error('Failed to stringify assistant content:', e);
              content = "Error: Could not process assistant response";
            }
          }
          
          await gearChat.addMessage({
            role: "assistant",
            content: content
          });
        }
        
        // Note: If you need to add all messages back to a storage system,
        // you could use appendResponseMessages here
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Error in chat API:", error);
    
    // Extract the actual error message
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return Response.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}