import { openai } from '@ai-sdk/openai';
import { createIdGenerator, generateText, streamText } from 'ai';
import { Gear } from "@/lib/models/Gear";
import { GearChat } from "@/lib/models/GearChat";
import { NextRequest } from 'next/server';
import { Message } from "@/lib/models/types";

export const runtime = "nodejs"; // Using nodejs instead of edge for Firebase compatibility

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
    
    // Mark this gear as being used in a server API handler to avoid duplicate API calls
    if ('markAsServerApiHandler' in gear) {
      (gear as any).markAsServerApiHandler();
      console.log(`Chat API: Marked gear ${gearId} as server API handler to optimize saves`);
    }
    
    console.log(`Chat API: Found gear with ${gear.messages.length} messages`);

    // Special requests are now deprecated - we have a separate label endpoint
    if (special === true) {
      console.warn("WARNING: Using deprecated 'special' flag in chat API. Use the dedicated /label endpoint instead.");
      
      // Use generateText instead of streamText
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        messages: messages,
      });
      
      return Response.json({ response: result.text });
    }

    // Normal chat flow - not a special request
    // Create GearChat instance
    const gearChat = new GearChat(gear.messages, gearId);
    
    // Add the latest user message to Gear (not just GearChat)
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage && lastUserMessage.role === "user") {
      console.log(`Chat API: Adding user message to gear ${gearId}`);
      try {
        // Use gear.addMessage() to ensure proper persistence
        await gear.addMessage({
          role: lastUserMessage.role,
          content: lastUserMessage.content
        });
        console.log(`Chat API: Successfully added user message to gear ${gearId}`);
      } catch (addError) {
        console.error(`Chat API: Error adding user message to gear:`, addError);
      }
    } else {
      console.log(`Chat API: No user message found to add to gear ${gearId}`);
    }

    // Prepare the messages array with system prompt
    // IMPORTANT: To avoid duplicate messages, we need to carefully construct the messages array
    
    // 1. Start with system prompt
    const systemPrompt = gear.systemPrompt();
    console.log(`Chat API: Using system prompt (${systemPrompt.length} chars)`);
    const allMessages = [
      { role: 'system' as const, content: systemPrompt },
    ];
    
    // 2. Add all messages from the gear's chat history EXCEPT the most recent user message
    // that we already added above at line 58
    const chatMessages = gearChat.getMessages();
    console.log(`Chat API: Got ${chatMessages.length} messages from gear chat history`);
    
    // Debug the current state
    console.log(`Chat API: Last user message from client:`, lastUserMessage?.content?.substring(0, 50) + '...');
    if (chatMessages.length > 0) {
      const lastChat = chatMessages[chatMessages.length - 1];
      console.log(`Chat API: Last message in chat history: role=${lastChat.role}, content=${lastChat.content?.substring(0, 50)}...`);
    }
    
    // If messages array from client is empty, use all chat messages
    if (!messages || messages.length === 0) {
      console.log(`Chat API: No messages from client, using all ${chatMessages.length} messages from chat history`);
      allMessages.push(...chatMessages.map(msg => ({
        role: msg.role as "system" | "user" | "assistant" | "data",
        content: msg.content
      })));
    } else {
      // Otherwise, use all messages except the last one (if it matches the most recent user message)
      // This prevents duplicate messages when the client includes the latest user message
      const lastUserMessageContent = lastUserMessage?.content;
      let skippedCount = 0;
      
      for (let i = 0; i < chatMessages.length; i++) {
        // Skip the last message if it's the same as what we just added above
        const isLastMessage = i === chatMessages.length - 1;
        const isUserMessage = chatMessages[i].role === "user";
        const hasSameContent = chatMessages[i].content === lastUserMessageContent;
        
        if (isLastMessage && isUserMessage && hasSameContent) {
          console.log(`Chat API: Skipping duplicate user message at position ${i}`);
          skippedCount++;
          continue;
        }
        
        allMessages.push({
          role: chatMessages[i].role as "system" | "user" | "assistant" | "data",
          content: chatMessages[i].content
        });
      }
      
      console.log(`Chat API: Added ${chatMessages.length - skippedCount} messages from chat history (skipped ${skippedCount})`);
      
      // 3. If client sent additional messages beyond the one we already added, include those
      if (messages.length > 1) {
        console.log(`Chat API: Client sent ${messages.length} messages, adding all but the last one`);
        // Add all client messages except the last user message (which we've already added to the gear)
        const additionalMessages = messages.slice(0, -1);
        allMessages.push(...additionalMessages.map(msg => ({
          role: msg.role as "system" | "user" | "assistant" | "data",
          content: msg.content
        })));
        console.log(`Chat API: Added ${additionalMessages.length} additional messages from client`);
      }
    }
    
    console.log(`Chat API: Sending ${allMessages.length} messages to LLM`);
    console.log(`Chat API: Using model gpt-4-turbo`);
    
    // Use streaming for a better user experience - this is the correct implementation for Vercel AI SDK
    try {
      console.log("Starting LLM streaming response");
      
      // Set up the stream with Vercel AI SDK
      const stream = streamText({
        model: openai('gpt-4-turbo'),
        messages: allMessages,
        // Create consistent IDs for messages
        experimental_generateMessageId: createIdGenerator({
          prefix: 'gear',
          size: 16,
        }),
        async onFinish({ response }) {
          try {
            // The actual streaming response that's sent to the client
            console.log(`Chat API: Streaming complete, processing response for gear ${gearId}`);
            
            // Check if response is valid
            if (!response || !response.messages) {
              console.log(`Chat API: Invalid response object:`, response);
              return;
            }
            
            // Find the assistant message in the response
            const assistantMessage = response.messages.find(msg => msg.role === "assistant");
            if (!assistantMessage) {
              console.warn(`Chat API: No assistant message found in streaming response`);
              return;
            }
            
            // Handle null/undefined content
            if (assistantMessage.content === null || assistantMessage.content === undefined) {
              console.warn(`Chat API: Assistant message has null/undefined content`);
              return;
            }
            
            // Log the raw content type and preview for debugging
            console.log(`Chat API: Raw assistant content type: ${typeof assistantMessage.content}`);
            if (typeof assistantMessage.content === 'string') {
              console.log(`Chat API: Raw content preview: ${assistantMessage.content.substring(0, 100)}...`);
            } else if (assistantMessage.content !== null && assistantMessage.content !== undefined) {
              console.log(`Chat API: Raw content preview (object): ${JSON.stringify(assistantMessage.content).substring(0, 100)}...`);
            }
            
            // Process the content - using the documented Vercel AI SDK format
            // The SDK uses TextUIPart objects: { type: 'text', text: string }
            let parsedContent;
            
            if (typeof assistantMessage.content === 'string') {
              try {
                // Attempt to parse if it looks like JSON
                if (assistantMessage.content.startsWith('[{') || assistantMessage.content.startsWith('{')) {
                  const parsed = JSON.parse(assistantMessage.content);
                  
                  // Handle array format: [{"type":"text","text":"content"}]
                  if (Array.isArray(parsed) && parsed[0]?.type === 'text' && 'text' in parsed[0]) {
                    parsedContent = parsed[0].text;
                    console.log(`Chat API: Extracted text from Vercel AI SDK format (TextUIPart array)`);
                  } 
                  // Handle single object format: {"type":"text","text":"content"}
                  else if (parsed?.type === 'text' && 'text' in parsed) {
                    parsedContent = parsed.text;
                    console.log(`Chat API: Extracted text from Vercel AI SDK format (TextUIPart)`);
                  }
                  // Unknown format, use as-is
                  else {
                    parsedContent = assistantMessage.content;
                    console.log(`Chat API: Unknown JSON format, using as-is`);
                  }
                } else {
                  // Not JSON, use as-is
                  parsedContent = assistantMessage.content;
                }
              } catch (e) {
                // If parsing fails, use original content
                parsedContent = assistantMessage.content;
                console.warn(`Chat API: Failed to parse content as JSON:`, e);
              }
            } else {
              // For non-string content, convert to string
              parsedContent = JSON.stringify(assistantMessage.content);
            }
            
            // Log processed content
            console.log(`Chat API: Processed content preview: ${typeof parsedContent === 'string' ? 
              parsedContent.substring(0, 100) : JSON.stringify(parsedContent).substring(0, 100)}...`);
            
            // Save the assistant message to the gear - no duplication check needed
            // since we've fixed the client to not save messages
            try {
              await gear.addMessage({
                role: "assistant",
                content: parsedContent
              });
              console.log(`Chat API: Successfully saved assistant response to gear ${gearId}`);
            } catch (saveError) {
              console.error(`Chat API: Failed to save assistant response:`, saveError);
            }
          } catch (finishError) {
            console.error(`Chat API: Error in onFinish handler:`, finishError);
          }
        },
      });

      // This is the key - toDataStreamResponse() is specifically designed to work with useChat
      return stream.toDataStreamResponse();
    } catch (llmError) {
      console.error(`Chat API: Error during LLM call:`, llmError);
      throw llmError;
    }
  } catch (error) {
    console.error("Error in chat API:", error);
    
    // Extract the actual error message
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // For error responses, the Vercel AI SDK also expects a specific format
    return Response.json(
      { 
        error: {
          message: errorMessage,
          // Include stack only in development mode
          ...(process.env.NODE_ENV === 'development' ? {
            stack: error instanceof Error ? error.stack : undefined,
          } : {})
        }
      },
      { status: 500 }
    );
  }
}