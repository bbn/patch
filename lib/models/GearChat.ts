import { Message, Role } from "./types";

export class GearChat {
  private messages: Message[];
  private gearId: string;

  constructor(messages: Message[] = [], gearId: string) {
    this.messages = messages;
    this.gearId = gearId;
  }

  getMessages(): Message[] {
    return this.messages;
  }

  async addMessage({ role, content }: { role: Role; content: string }): Promise<Message> {
    const message = { id: crypto.randomUUID(), role, content };
    this.messages.push(message);
    return message;
  }
}