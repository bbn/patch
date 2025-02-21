
// import { kv } from '@vercel/kv'

export interface GearData {
  id: string
  systemPrompt?: string
  outputUrls: string[]
  inputMessage: string
  outputMessage: string
  createdAt: number
  updatedAt: number
}

export class Gear {
  private data: GearData

  constructor(data: Partial<GearData> & { id: string }) {
    this.data = {
      id: data.id,
      systemPrompt: data.systemPrompt || "You are a helpful assistant.",
      outputUrls: data.outputUrls || [],
      inputMessage: data.inputMessage || "",
      outputMessage: data.outputMessage || "",
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now()
    }
  }

  // static async findById(id: string): Promise<Gear | null> {
  //   const data = await kv.get<GearData>(`gear:${id}`)
  //   return data ? new Gear(data) : null
  // }

  static async create(data: Partial<GearData> & { id: string }): Promise<Gear> {
    const gear = new Gear(data)
    await gear.save()
    return gear
  }

  async save(): Promise<void> {
    this.data.updatedAt = Date.now()
    // await kv.set(`gear:${this.data.id}`, this.data)
  }

  // async delete(): Promise<void> {
  //   await kv.del(`gear:${this.data.id}`)
  // }

  // Getters
  get id() { return this.data.id }
  get systemPrompt() { return this.data.systemPrompt }
  get outputUrls() { return this.data.outputUrls }
  get inputMessage() { return this.data.inputMessage }
  get outputMessage() { return this.data.outputMessage }
  get createdAt() { return this.data.createdAt }
  get updatedAt() { return this.data.updatedAt }

  // Setters
  set systemPrompt(value: string) { this.data.systemPrompt = value }
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
