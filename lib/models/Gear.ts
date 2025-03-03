// import { kv } from '@vercel/kv'
import { GearChat } from "./GearChat";
import { Message, Role, GearInput, GearOutput } from "./types";

// In-memory store for development purposes
const gearStore = new Map<string, GearData>();

// Initialize with some test gears if empty
if (gearStore.size === 0) {
  const defaultGear = {
    id: "gear-default",
    outputUrls: [],
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  gearStore.set(defaultGear.id, defaultGear);
}

export interface GearData {
  id: string;
  outputUrls: string[];
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  inputs?: Record<string, GearInput>;
  output?: GearOutput;
}

export class Gear {
  private data: GearData;
  private chat: GearChat;

  constructor(data: Partial<GearData> & { id: string }) {
    this.data = {
      id: data.id,
      outputUrls: data.outputUrls || [],
      messages: data.messages || [],
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      inputs: data.inputs || {},
      output: data.output,
    };
    this.chat = new GearChat(this.data.messages, this.data.id);
  }

  static async create(data: Partial<GearData> & { id: string }): Promise<Gear> {
    const gear = new Gear(data);
    await gear.save();
    return gear;
  }
  
  static async deleteById(id: string): Promise<boolean> {
    if (gearStore.has(id)) {
      return gearStore.delete(id);
    }
    return false;
  }

  static async findById(id: string): Promise<Gear | null> {
    // Check if gear exists in memory store
    if (gearStore.has(id)) {
      return new Gear(gearStore.get(id)!);
    }
    
    // If not in memory, try to get from localStorage (in browser environment)
    if (typeof window !== 'undefined') {
      try {
        const savedGears = localStorage.getItem('gears');
        if (savedGears) {
          const gears = JSON.parse(savedGears);
          const gearData = gears.find((g: {id: string}) => g.id === id);
          
          if (gearData) {
            // Add to memory store and return
            const gear = new Gear(gearData);
            gearStore.set(id, { ...gearData });
            return gear;
          }
        }
      } catch (error) {
        console.error("Error loading gear from localStorage:", error);
      }
    }
    
    // Return null if gear not found
    return null;
  }
  
  // Get all gears from the store
  static async findAll(): Promise<Gear[]> {
    // Get gears from memory store
    const memoryGears = Array.from(gearStore.values()).map(data => new Gear(data));
    
    // In browser environment, also try to get from localStorage
    if (typeof window !== 'undefined') {
      try {
        const savedGearsStr = localStorage.getItem('gears');
        if (savedGearsStr) {
          const savedGears = JSON.parse(savedGearsStr);
          
          // For any gear in localStorage but not in memory, add it to memory and to the result
          for (const gearData of savedGears) {
            if (!gearStore.has(gearData.id)) {
              gearStore.set(gearData.id, gearData);
              memoryGears.push(new Gear(gearData));
            }
          }
        }
      } catch (error) {
        console.error("Error loading gears from localStorage:", error);
      }
    }
    
    return memoryGears;
  }

  async save(): Promise<void> {
    this.data.updatedAt = Date.now();
    
    // Store in memory map
    gearStore.set(this.data.id, { ...this.data });
    
    // Save to localStorage in browser environment
    if (typeof window !== 'undefined') {
      try {
        // Get existing gears
        const savedGearsStr = localStorage.getItem('gears');
        const savedGears = savedGearsStr ? JSON.parse(savedGearsStr) : [];
        
        // Find index of this gear if it exists
        const gearIndex = savedGears.findIndex((g: {id: string}) => g.id === this.data.id);
        
        if (gearIndex >= 0) {
          // Update existing gear
          savedGears[gearIndex] = { ...this.data };
        } else {
          // Add new gear
          savedGears.push({ ...this.data });
        }
        
        // Save back to localStorage
        localStorage.setItem('gears', JSON.stringify(savedGears));
      } catch (error) {
        console.error("Error saving gear to localStorage:", error);
      }
    }
    
    // await kv.set(`gear:${this.data.id}`, this.data)
  }

  // Getters
  get id() {
    return this.data.id;
  }
  get outputUrls() {
    return this.data.outputUrls;
  }
  get messages() {
    return this.data.messages;
  }
  get createdAt() {
    return this.data.createdAt;
  }
  get updatedAt() {
    return this.data.updatedAt;
  }

  get inputs() {
    return this.data.inputs || {};
  }

  get output() {
    return this.data.output;
  }

  async addMessage({ role, content }: { role: Role; content: string }) {
    await this.chat.addMessage({ role, content });
    // Note: we don't need to push to data.messages since the GearChat maintains the same reference
    await this.save();
  }

  async processInput(source: string, input: GearInput): Promise<GearOutput> {
    if (!this.data.inputs) {
      this.data.inputs = {};
    }
    this.data.inputs[source] = input;
    this.data.updatedAt = Date.now();
    await this.save();
    return this.process();
  }

  async addOutputUrl(url: string) {
    if (!this.data.outputUrls.includes(url)) {
      this.data.outputUrls.push(url);
      await this.save();
    }
  }

  async removeOutputUrl(url: string) {
    this.data.outputUrls = this.data.outputUrls.filter((u) => u !== url);
    await this.save();
  }

  systemPrompt(): string {
    const basePrompt = `You are interacting with a Gear in a distributed message processing system. A Gear is a modular component that processes messages and produces outputs that can be consumed by other Gears. The processing instructions are communicated to the gear via chat messages.

    Here are this Gear's instructional messages:
    ${JSON.stringify(this.data.messages, null, 2)}

    Please process the input data and generate an output according to the instruction.`;

    return basePrompt;
  }

  userPrompt(data?: GearInput): string {
    // If data is provided directly, use it (for backward compatibility)
    if (data !== undefined) {
      const formattedInput = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      return `Here is the input data: ${formattedInput}`;
    }
    
    // Otherwise, use all inputs from the inputs dictionary
    const allInputs = this.data.inputs || {};
    const formattedInputs = JSON.stringify(allInputs, null, 2);
    return `Here are the input data sources: ${formattedInputs}`;
  }

  async process(input?: GearInput) {
    try {
      if (input !== undefined) {
        // For backward compatibility, if input is provided directly,
        // process just that input directly
        const output = await this.processWithLLM(input);
        this.data.output = output;
        await this.save();
        await this.forwardOutputToGears(output);
        return output;
      }
      
      // Process all inputs from the inputs dictionary
      const output = await this.processWithLLM();
      this.data.output = output;
      await this.save();
      await this.forwardOutputToGears(output);
      return output;
    } catch (error) {
      console.error(`Error processing: ${error}`);
      throw error;
    }
  }
  
  private async processWithLLM(input?: GearInput): Promise<GearOutput> {
    try {
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
                content: this.systemPrompt()
              },
              {
                role: 'user',
                content: this.userPrompt(input)
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
      console.log(`Calling LLM API for gear ${this.id}`);
      
      // Construct messages for the chat
      const messages = [
        {
          role: "system",
          content: this.systemPrompt()
        },
        {
          role: "user", 
          content: this.userPrompt(input)
        }
      ];
      
      // We need to capture the streaming response
      // This will be a complex implementation that uses the Vercel AI SDK
      // For now, let's use a simpler approach that uses text/event-stream
      const controller = new AbortController();
      const signal = controller.signal;
      
      try {
        console.log(`Sending request to /api/gears/${this.id}/chat`);
        const response = await fetch(`/api/gears/${this.id}/chat`, {
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
        
        // Check if we have a streaming response
        if (response.headers.get("content-type")?.includes("text/event-stream")) {
          // Handle streaming response
          console.log("Got streaming response, processing events");
          
          // Simple accumulator for the streamed content
          let accumulatedContent = "";
          
          // Create a reader for the response body
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          
          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Decode the chunk
            const chunk = decoder.decode(value);
            
            // Simple parsing of SSE format
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  // End of stream
                  break;
                }
                
                try {
                  // Parse the JSON in the data
                  const parsed = JSON.parse(data);
                  if (parsed.type === "text" && parsed.value) {
                    accumulatedContent += parsed.value;
                  }
                } catch (e) {
                  console.warn("Error parsing SSE data:", e);
                }
              }
            }
          }
          
          console.log("Final accumulated content:", accumulatedContent);
          return accumulatedContent;
        } else {
          // Regular JSON response
          console.log("Got regular JSON response");
          const result = await response.json();
          
          if (!result.content && !result.text) {
            throw new Error("Received empty content from LLM response");
          }
          
          return result.content || result.text;
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

  private async forwardOutputToGears(output: GearOutput): Promise<void> {
    // If there are no output gears, just return early
    if (!this.outputUrls || this.outputUrls.length === 0) {
      return;
    }
    console.log(
      `Forwarding output from ${this.id} to output gears ${this.outputUrls}: ${output}`,
    );
    for (const url of this.outputUrls) {
      const newMessageId = crypto.randomUUID();
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_gear_id: this.id,
            message_id: newMessageId,
            data: output,
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (error) {
        console.error(`Error forwarding to ${url}: ${error}`);
      }
    }
  }
}
