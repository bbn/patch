// import { kv } from '@vercel/kv'

export type Role = "user" | "assistant" | "system";

export interface Message {
  role: Role;
  content: string;
}

export interface GearData {
  id: string;
  outputUrls: string[];
  inputMessage: string;
  outputMessage: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export class Gear {
  private data: GearData;

  constructor(data: Partial<GearData> & { id: string }) {
    this.data = {
      id: data.id,
      outputUrls: data.outputUrls || [],
      inputMessage: data.inputMessage || "",
      outputMessage: data.outputMessage || "",
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
  get inputMessage() {
    return this.data.inputMessage;
  }
  get outputMessage() {
    return this.data.outputMessage;
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

  addMessage(role: Role, content: string) {
    this.data.messages.push({ role, content });
  }

  clearMessages() {
    this.data.messages = [];
  }

  // Setters
  set inputMessage(value: string) {
    this.data.inputMessage = value;
  }
  set outputMessage(value: string) {
    this.data.outputMessage = value;
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

  userPrompt(data: any): string {
    const formattedInput = JSON.stringify(data, null, 2);
    return `Here is the input data: ${formattedInput}`;
  }

  async process(messageData: { data: any }) {
    try {
      const output = await this.processWithLLM(messageData.data);
      await this.forwardOutputToGears(output);
      return output;
    } catch (error) {
      console.error(`Error processing: ${error}`);
      throw error;
    }
  }

  private async processWithLLM(data: any): Promise<any> {
    const response = await fetch("/api/gears/" + this.id, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputMessage: data }),
    });
    if (!response.ok) {
      throw new Error("Failed to process with LLM");
    }
    return await response.json();
  }

  private async forwardOutputToGears(output: any): Promise<void> {
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
