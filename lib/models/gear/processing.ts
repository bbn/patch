import { Gear } from "./Gear";
import { GearInput, GearOutput } from "../types";

/**
 * Process input with LLM using the gear's context
 * This handles both browser and server environments
 */
export async function processWithLLM(gear: Gear, input?: GearInput): Promise<GearOutput> {
  try {
    // For tests, check if we're in test mode with mocking enabled
    if (typeof global !== 'undefined' && (global as any).MOCK_LLMS === true) {
      console.log(`Using mock LLM response for gear ${gear.id} in test mode`);
      // Return appropriate response based on gear ID for specialized test cases
      if (gear.id.includes('activity') || gear.id.includes('daily')) {
        return `# Daily Activity Summary

## Slack Highlights
- User1 sent 5 messages in #general
- User2 mentioned you in #dev-team

## JIRA Updates
- 3 tickets assigned to you
- 2 tickets closed today

## Action Items
- Respond to User2's mention
- Check ticket PROJ-123`;
      }
      
      return "This is a mock LLM response for testing purposes";
    }
    
    // For tests, this method should be mocked unless the actual LLM call is desired
    if (typeof window === 'undefined') {
      // In a Node.js environment (tests), we should use the Vercel AI SDK
      try {
        // Dynamically import the Vercel AI SDK to avoid requiring it at runtime in the browser
        const { generateText } = await import('ai');
        const { openai } = await import('@ai-sdk/openai');
        
        // Use the Vercel AI SDK to generate text
        const response = await generateText({
          model: openai('gpt-4o-mini'),
          messages: [
            { 
              role: 'system',
              content: gear.systemPrompt()
            },
            {
              role: 'user',
              content: gear.userPrompt(input)
            }
          ]
        });
        
        return response.text;
      } catch {
        // If the real API call fails or the SDK is not available, throw an error
        throw new Error("Error using AI SDK. If testing, use --mock-llms flag to mock LLM calls.");
      }
    }
    
    // Browser environment - use the API endpoint
    console.log(`Calling LLM API for gear ${gear.id}`);
    
    // Construct messages for the chat
    const messages = [
      {
        role: "system",
        content: gear.systemPrompt()
      },
      {
        role: "user", 
        content: gear.userPrompt(input)
      }
    ];
    
    // For processing examples, use direct API call (not chat endpoint)
    if (input !== undefined) {
      console.log(`Processing input directly for gear ${gear.id}`);
      try {
        const response = await fetch(`/api/gears/${gear.id}`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ 
            message: input,
            source: 'example'
          })
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error(`API error: ${response.status} ${text}`);
          throw new Error(`Failed to process input: ${response.status} ${text}`);
        }
        
        try {
          const text = await response.text();
          console.log("Raw API response:", text.substring(0, 100) + "...");
          
          try {
            const result = JSON.parse(text);
            return result.output || text;
          } catch (jsonError) {
            console.warn("Failed to parse JSON response from API, using raw text:", jsonError);
            return text;
          }
        } catch (textError) {
          console.error("Error reading API response text:", textError);
          return "Error reading API response";
        }
      } catch (error) {
        console.error("Error in direct API call:", error);
        throw error;
      }
    }
    
    // For chat interactions and other processing without specific input, use chat endpoint
    const controller = new AbortController();
    const signal = controller.signal;
    
    try {
      console.log(`Sending request to /api/gears/${gear.id}/chat`);
      const response = await fetch(`/api/gears/${gear.id}/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ messages }),
        signal
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.error(`LLM API error: ${response.status} ${text}`);
        throw new Error(`Failed to process with LLM: ${response.status} ${text}`);
      }
      
      // Regular JSON response
      console.log("Got regular JSON response");
      
      try {
        const text = await response.text();
        console.log("Raw response:", text.substring(0, 100) + "...");
        
        try {
          const result = JSON.parse(text);
          
          if (!result.text && !result.content && !result.response) {
            console.warn("Received potentially empty content from LLM response");
            // Return the raw text if we can't find content or text fields
            return text;
          }
          
          return result.text || result.content || result.response || text;
        } catch (jsonError) {
          console.warn("Failed to parse JSON response, using raw text:", jsonError);
          return text; // Use raw text if JSON parsing fails
        }
      } catch (textError) {
        console.error("Error getting response text:", textError);
        return "Error reading response";
      }
    } catch (error) {
      console.error("Error in LLM API call:", error);
      throw error;
    } finally {
      // Clean up the controller
      controller.abort();
    }
  } catch (error) {
    console.error("Error processing with LLM:", error);
    throw error;
  }
}

/**
 * Process a special prompt that's not part of the standard input-output flow
 * Used for things like label generation
 */
export async function processWithSpecialPrompt(gear: Gear, prompt: string): Promise<string> {
  try {
    // For tests, check if we're in test mode with mocking enabled
    if (typeof global !== 'undefined' && (global as any).MOCK_LLMS === true) {
      console.log(`Using mock LLM response for special prompt in test mode: ${prompt.substring(0, 50)}...`);
      
      // Check for patch description generation
      if (prompt.includes('description') || prompt.includes('nodes')) {
        return "This patch processes data through a pipeline and generates reports with key insights.";
      }
      
      // Check for gear label generation
      if (prompt.includes('label') || prompt.includes('name')) {
        return "Data Processor";
      }
      
      return "This is a mock LLM response for a special prompt in testing mode";
    }
    
    if (typeof window === 'undefined') {
      // In a Node.js environment (tests), we should use the Vercel AI SDK
      try {
        // Dynamically import the Vercel AI SDK to avoid requiring it at runtime in the browser
        const { generateText } = await import('ai');
        const { openai } = await import('@ai-sdk/openai');
        
        // Use the Vercel AI SDK to generate text
        const response = await generateText({
          model: openai('gpt-4o-mini'),
          messages: [
            { 
              role: 'user',
              content: prompt
            }
          ]
        });
        
        return response.text;
      } catch {
        // If the real API call fails or the SDK is not available, throw an error
        throw new Error("Error using AI SDK. If testing, use --mock-llms flag to mock LLM calls.");
      }
    }
    
    // Browser environment - use the dedicated label API endpoint
    console.log(`Calling label API for gear ${gear.id}`);
    
    // Use the label endpoint with the prompt
    const controller = new AbortController();
    const signal = controller.signal;
    
    try {
      const response = await fetch(`/api/gears/${gear.id}/label`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          prompt: prompt
        }),
        signal
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.error(`LLM API error: ${response.status} ${text}`);
        throw new Error(`Failed to process with LLM: ${response.status} ${text}`);
      }
      
      // Regular JSON response
      try {
        const text = await response.text();
        console.log("Raw response:", text.substring(0, 100) + "...");
        
        try {
          const result = JSON.parse(text);
          return result.text || result.content || result.response || text;
        } catch (jsonError) {
          console.warn("Failed to parse JSON response, using raw text:", jsonError);
          return text; // Use raw text if JSON parsing fails
        }
      } catch (textError) {
        console.error("Error getting response text:", textError);
        return "Error reading response";
      }
    } catch (error) {
      console.error("Error in LLM API call:", error);
      throw error;
    } finally {
      controller.abort();
    }
  } catch (error) {
    console.error("Error processing special prompt with LLM:", error);
    throw error;
  }
}