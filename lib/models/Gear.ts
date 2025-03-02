// import { kv } from '@vercel/kv'

// In-memory store for development purposes
const gearStore = new Map<string, GearData>();

export type Role = "user" | "assistant" | "system";

export interface Message {
  id?: string;
  role: Role;
  content: string;
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

// Define a type for gear input/output data
export type GearInput = string | Record<string, unknown>;
export type GearOutput = string | Record<string, unknown>;

export class Gear {
  private data: GearData;

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
    
    // Return null if gear not found
    return null;
  }
  
  // Get all gears from the store
  static async findAll(): Promise<Gear[]> {
    return Array.from(gearStore.values()).map(data => new Gear(data));
  }

  async save(): Promise<void> {
    this.data.updatedAt = Date.now();
    // Store in memory map
    gearStore.set(this.data.id, { ...this.data });
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
    this.data.messages.push({ id: crypto.randomUUID(), role, content });
    await this.save();
  }

  async processInput(source: string, input: GearInput): Promise<GearOutput> {
    if (!this.data.inputs) {
      this.data.inputs = {};
    }
    this.data.inputs[source] = input;
    this.data.updatedAt = Date.now();
    await this.save();
    
    // Automatically process when input is set
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
        } catch (error) {
          // If the real API call fails or the SDK is not available, throw an error
          throw new Error("Error using AI SDK. If testing, use --mock-llms flag to mock LLM calls.");
        }
      }
      
      // Browser environment - use the API endpoint
      const response = await fetch("/api/gears/" + this.id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: [
            {
              role: "system",
              content: this.systemPrompt()
            },
            {
              role: "user", 
              content: this.userPrompt(input)
            }
          ]
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to process with LLM");
      }
      const result = await response.json();
      if (!result.content) {
        throw new Error("Received empty content from LLM response");
      }
      return result.content;
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
