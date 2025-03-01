// import { kv } from '@vercel/kv'

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
    };
  }

  static async create(data: Partial<GearData> & { id: string }): Promise<Gear> {
    const gear = new Gear(data);
    await gear.save();
    return gear;
  }

  static async findById(id: string): Promise<Gear | null> {
    // In a real implementation, this would fetch from a database
    // For now, return dummy data
    const dummyData: GearData = {
      id,
      outputUrls: [`https://example.com/gear/${id}/output`],
      messages: [
        { id: crypto.randomUUID(), role: "system", content: "You are a helpful assistant gear." },
        { id: crypto.randomUUID(), role: "user", content: "Process this data please." },
        { id: crypto.randomUUID(), role: "assistant", content: "I've processed your data successfully." }
      ],
      createdAt: Date.now() - 86400000, // 1 day ago
      updatedAt: Date.now() - 3600000,  // 1 hour ago
    };
    
    return new Gear(dummyData);
  }

  async save(): Promise<void> {
    this.data.updatedAt = Date.now();
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

  addMessage({ role, content }: { role: Role; content: string }) {
    this.data.messages.push({ id: crypto.randomUUID(), role, content });
  }

  addOutputUrl(url: string) {
    if (!this.data.outputUrls.includes(url)) {
      this.data.outputUrls.push(url);
    }
  }

  removeOutputUrl(url: string) {
    this.data.outputUrls = this.data.outputUrls.filter((u) => u !== url);
  }

  systemPrompt(): string {
    const basePrompt = `You are interacting with a Gear in a distributed message processing system. A Gear is a modular component that processes messages and produces outputs that can be consumed by other Gears. The processing instructions are communicated to the gear via chat messages.

  Here are this Gear's instructional messages:
  ${JSON.stringify(this.data.messages, null, 2)}

  Please process the input data and generate an output according to the instruction.`;

    return basePrompt;
  }

  userPrompt(data: GearInput): string {
    const formattedInput = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return `Here is the input data: ${formattedInput}`;
  }

  async process(input: GearInput) {
    try {
      const output = await this.processWithLLM(input);
      await this.forwardOutputToGears(output);
      return output;
    } catch (error) {
      console.error(`Error processing: ${error}`);
      throw error;
    }
  }

  private async processWithLLM(input: GearInput): Promise<GearOutput> {
    try {
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
