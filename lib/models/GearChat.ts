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

  async addMessage({ role, content, id }: { role: Role; content: string; id?: string }): Promise<Message> {
    console.log(`GearChat.addMessage: Adding ${role} message to gear ${this.gearId}`);
    
    if (!content) {
      console.warn(`GearChat.addMessage: Warning - Empty content for ${role} message`);
    }
    
    // Use provided ID or generate a new one
    const messageId = id || crypto.randomUUID();
    
    const message = { id: messageId, role, content };
    this.messages.push(message);
    
    console.log(`GearChat.addMessage: Successfully added message with ID ${message.id}`);
    console.log(`GearChat.addMessage: Gear now has ${this.messages.length} messages`);
    
    return message;
  }
  
  async setMessages(messages: Message[]): Promise<void> {
    // Clear current messages
    this.messages.length = 0;
    
    // Add all messages with proper IDs
    for (const msg of messages) {
      this.messages.push({
        id: msg.id || crypto.randomUUID(),
        role: msg.role,
        content: msg.content
      });
    }
  }
}