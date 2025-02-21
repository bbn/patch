// import { kv } from '@vercel/kv'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface GearData {
  id: string
  outputUrls: string[]
  inputMessage: string
  outputMessage: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export class Gear {
  private data: GearData

  constructor(data: Partial<GearData> & { id: string }) {
    this.data = {
      id: data.id,
      outputUrls: data.outputUrls || [],
      inputMessage: data.inputMessage || "",
      outputMessage: data.outputMessage || "",
      messages: data.messages || [],
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now()
    }
  }

  systemPrompt(): string {
    return "You are a helpful assistant."
  }

  static async create(data: Partial<GearData> & { id: string }): Promise<Gear> {
    const gear = new Gear(data)
    await gear.save()
    return gear
  }

  async save(): Promise<void> {
    this.data.updatedAt = Date.now()
    // await kv.set(`gear:${this.data.id}`, this.data)
  }

  // Getters
  get id() { return this.data.id }
  get outputUrls() { return this.data.outputUrls }
  get inputMessage() { return this.data.inputMessage }
  get outputMessage() { return this.data.outputMessage }
  get messages() { return this.data.messages }
  get createdAt() { return this.data.createdAt }
  get updatedAt() { return this.data.updatedAt }

  addMessage(role: 'user' | 'assistant', content: string) {
    this.data.messages.push({ role, content })
  }

  clearMessages() {
    this.data.messages = []
  }

  // Setters
  set inputMessage(value: string) { this.data.inputMessage = value }
  set outputMessage(value: string) { this.data.outputMessage = value }

  addOutputUrl(url: string) {
    if (!this.data.outputUrls.includes(url)) {
      this.data.outputUrls.push(url)
    }
  }

  removeOutputUrl(url: string) {
    this.data.outputUrls = this.data.outputUrls.filter(u => u !== url)
  }
}