import { openai } from '@ai-sdk/openai';
import { createIdGenerator, generateText, streamText } from 'ai';
import { Gear } from "@/lib/models/Gear";
import { GearChat } from "@/lib/models/GearChat";
import { NextRequest } from 'next/server';
import { Message } from "@/lib/models/types";
import { logInfo, logError, logWarning } from "@/lib/logger";

export const runtime = "nodejs"; // Using nodejs instead of edge for Firebase compatibility

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gearId: string }> }
) {
  try {
    const resolvedParams = await params;
    logInfo("ChatAPI", `Called with gearId: ${resolvedParams.gearId}`);
    const { messages, special } = await request.json();
    const gearId = resolvedParams.gearId;

    // Try to find the gear
    const gear = await Gear.findById(gearId);
    
    if (!gear) {
      logInfo("ChatAPI", `Gear not found: ${gearId}`);
      return new Response("Gear not found", { status: 404 });
    }
    
    // Mark this gear as being used in a server API handler to avoid duplicate API calls
    if ('markAsServerApiHandler' in gear) {
      (gear as any).markAsServerApiHandler();
      logInfo("ChatAPI", `Marked gear ${gearId} as server API handler to optimize saves`);
    }
    
    logInfo("ChatAPI", `Found gear with ${gear.messages.length} messages`);

    // Special requests are now deprecated - we have a separate label endpoint
    if (special === true) {
      logWarning("ChatAPI", "Using deprecated 'special' flag in chat API. Use the dedicated /label endpoint instead.");
      
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
      logInfo("ChatAPI", `Adding user message to gear ${gearId}`);
      try {
        // Use gear.addMessage() to ensure proper persistence
        await gear.addMessage({
          role: lastUserMessage.role,
          content: lastUserMessage.content
        });
        logInfo("ChatAPI", `Successfully added user message to gear ${gearId}`);
      } catch (addError) {
        logError("ChatAPI", `Error adding user message to gear:`, addError);
      }
    } else {
      logInfo("ChatAPI", `No user message found to add to gear ${gearId}`);
    }

    // Prepare the messages array with system prompt
    // IMPORTANT: To avoid duplicate messages, we need to carefully construct the messages array
    
    // 1. Start with system prompt
    const systemPrompt = gear.systemPrompt();
    logInfo("ChatAPI", `Using system prompt (${systemPrompt.length} chars)`);
    // Define the allowed role types to help with type checking
    type AllowedRole = 'system' | 'user' | 'assistant' | 'data';
    
    const allMessages = [
      { role: 'system' as const, content: systemPrompt },
    ] as Array<{ role: AllowedRole, content: string }>;
    
    // 2. Add all messages from the gear's chat history EXCEPT the most recent user message
    // that we already added above at line 58
    const chatMessages = gearChat.getMessages();
    logInfo("ChatAPI", `Got ${chatMessages.length} messages from gear chat history`);
    
    // Debug the current state
    logInfo("ChatAPI", `Last user message from client: ${lastUserMessage?.content?.substring(0, 50)}...`);
    if (chatMessages.length > 0) {
      const lastChat = chatMessages[chatMessages.length - 1];
      logInfo("ChatAPI", `Last message in chat history: role=${lastChat.role}, content=${lastChat.content?.substring(0, 50)}...`);
    }
    
    // If messages array from client is empty, use all chat messages
    if (!messages || messages.length === 0) {
      logInfo("ChatAPI", `No messages from client, using all ${chatMessages.length} messages from chat history`);
      // Add messages with explicit type casting
      for (const msg of chatMessages) {
        const role = msg.role === 'system' ? 'system' as const : 
                    msg.role === 'user' ? 'user' as const : 
                    msg.role === 'assistant' ? 'assistant' as const : 
                    'data' as const;
        
        allMessages.push({
          role,
          content: msg.content
        });
      }
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
          logInfo("ChatAPI", `Skipping duplicate user message at position ${i}`);
          skippedCount++;
          continue;
        }
        
        // Properly type the role with const assertions
        const role = chatMessages[i].role === 'system' ? 'system' as const : 
                    chatMessages[i].role === 'user' ? 'user' as const : 
                    chatMessages[i].role === 'assistant' ? 'assistant' as const : 
                    'data' as const;
        
        allMessages.push({
          role,
          content: chatMessages[i].content
        });
      }
      
      logInfo("ChatAPI", `Added ${chatMessages.length - skippedCount} messages from chat history (skipped ${skippedCount})`);
      
      // 3. If client sent additional messages beyond the one we already added, include those
      if (messages.length > 1) {
        logInfo("ChatAPI", `Client sent ${messages.length} messages, adding all but the last one`);
        // Add all client messages except the last user message (which we've already added to the gear)
        const additionalMessages = messages.slice(0, -1);
        // Add each message individually with proper typing
        for (const msg of additionalMessages) {
          const role = msg.role === 'system' ? 'system' as const : 
                      msg.role === 'user' ? 'user' as const : 
                      msg.role === 'assistant' ? 'assistant' as const : 
                      'data' as const;
          
          allMessages.push({
            role,
            content: msg.content
          });
        }
        logInfo("ChatAPI", `Added ${additionalMessages.length} additional messages from client`);
      }
    }
    
    logInfo("ChatAPI", `Sending ${allMessages.length} messages to LLM`);
    logInfo("ChatAPI", `Using model gpt-4-turbo`);
    
    // Use streaming for a better user experience - this is the correct implementation for Vercel AI SDK
    try {
      logInfo("ChatAPI", "Starting LLM streaming response");
      
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
            logInfo("ChatAPI", `Streaming complete, processing response for gear ${gearId}`);
            
            // Check if response is valid
            if (!response || !response.messages) {
              logInfo("ChatAPI", `Invalid response object: ${JSON.stringify(response)}`);
              return;
            }
            
            // Find the assistant message in the response
            const assistantMessage = response.messages.find(msg => msg.role === "assistant");
            if (!assistantMessage) {
              logWarning("ChatAPI", `No assistant message found in streaming response`);
              return;
            }
            
            // Handle null/undefined content
            if (assistantMessage.content === null || assistantMessage.content === undefined) {
              logWarning("ChatAPI", `Assistant message has null/undefined content`);
              return;
            }
            
            // Log the raw content type and preview for debugging
            logInfo("ChatAPI", `Raw assistant content type: ${typeof assistantMessage.content}`);
            if (typeof assistantMessage.content === 'string') {
              logInfo("ChatAPI", `Raw content preview: ${assistantMessage.content.substring(0, 100)}...`);
            } else if (assistantMessage.content !== null && assistantMessage.content !== undefined) {
              logInfo("ChatAPI", `Raw content preview (object): ${JSON.stringify(assistantMessage.content).substring(0, 100)}...`);
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
                    logInfo("ChatAPI", `Extracted text from Vercel AI SDK format (TextUIPart array)`);
                  } 
                  // Handle single object format: {"type":"text","text":"content"}
                  else if (parsed?.type === 'text' && 'text' in parsed) {
                    parsedContent = parsed.text;
                    logInfo("ChatAPI", `Extracted text from Vercel AI SDK format (TextUIPart)`);
                  }
                  // Unknown format, use as-is
                  else {
                    parsedContent = assistantMessage.content;
                    logInfo("ChatAPI", `Unknown JSON format, using as-is`);
                  }
                } else {
                  // Not JSON, use as-is
                  parsedContent = assistantMessage.content;
                }
              } catch (e) {
                // If parsing fails, use original content
                parsedContent = assistantMessage.content;
                logWarning("ChatAPI", `Failed to parse content as JSON: ${e}`);
              }
            } else {
              // For non-string content, convert to string
              parsedContent = JSON.stringify(assistantMessage.content);
            }
            
            // Log processed content
            logInfo("ChatAPI", `Processed content preview: ${typeof parsedContent === 'string' ? 
              parsedContent.substring(0, 100) : JSON.stringify(parsedContent).substring(0, 100)}...`);
            
            // Save the assistant message to the gear - no duplication check needed
            // since we've fixed the client to not save messages
            try {
              await gear.addMessage({
                role: "assistant",
                content: parsedContent
              });
              logInfo("ChatAPI", `Successfully saved assistant response to gear ${gearId}`);
            } catch (saveError) {
              logError("ChatAPI", `Failed to save assistant response:`, saveError);
            }
          } catch (finishError) {
            logError("ChatAPI", `Error in onFinish handler:`, finishError);
          }
        },
      });

      // This is the key - toDataStreamResponse() is specifically designed to work with useChat
      return stream.toDataStreamResponse();
    } catch (llmError) {
      logError("ChatAPI", `Error during LLM call:`, llmError);
      throw llmError;
    }
  } catch (error) {
    logError("ChatAPI", "Error in chat API:", error);
    
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