import { saveToKV, getFromKV, deleteFromKV, listKeysFromKV } from '../kv';
import { GearChat } from "./GearChat";
import { Message, Role, GearInput, GearOutput } from "./types";

// No in-memory store - using Vercel KV exclusively for serverless architecture

export interface ExampleInput {
  id: string;
  name: string;
  input: GearInput;
  output?: GearOutput;
  lastProcessed?: number;
}

export interface GearData {
  id: string;
  outputUrls: string[];
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  inputs?: Record<string, GearInput>;
  output?: GearOutput;
  exampleInputs?: ExampleInput[];
  label?: string;
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
      exampleInputs: data.exampleInputs || [],
      label: data.label || `Gear ${data.id.slice(0, 8)}`,
    };
    this.chat = new GearChat(this.data.messages, this.data.id);
  }

  static async create(data: Partial<GearData> & { id: string }): Promise<Gear> {
    const gear = new Gear(data);
    await gear.save();
    return gear;
  }
  
  static async deleteById(id: string): Promise<boolean> {
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        const response = await fetch(`/api/gears/${id}`, {
          method: 'DELETE',
        });
        
        const success = response.ok;
        
        // Also clean up localStorage for backward compatibility
        try {
          const savedGearsStr = localStorage.getItem('gears');
          if (savedGearsStr) {
            const savedGears = JSON.parse(savedGearsStr);
            const filteredGears = savedGears.filter((g: {id: string}) => g.id !== id);
            if (filteredGears.length !== savedGears.length) {
              localStorage.setItem('gears', JSON.stringify(filteredGears));
            }
          }
        } catch (error) {
          console.error(`Error deleting gear ${id} from localStorage:`, error);
        }
        
        return success;
      } catch (error) {
        console.error(`Error deleting gear ${id}:`, error);
        
        // Fallback to just localStorage if API fails
        try {
          const savedGearsStr = localStorage.getItem('gears');
          if (savedGearsStr) {
            const savedGears = JSON.parse(savedGearsStr);
            const filteredGears = savedGears.filter((g: {id: string}) => g.id !== id);
            const success = filteredGears.length !== savedGears.length;
            if (success) {
              localStorage.setItem('gears', JSON.stringify(filteredGears));
            }
            return success;
          }
        } catch (storageError) {
          console.error(`Error deleting gear ${id} from localStorage:`, storageError);
        }
        
        return false;
      }
    } else {
      // Server-side: Use KV directly
      const deleted = await deleteFromKV(`gear:${id}`);
      
      if (deleted) {
        console.log(`Deleted gear ${id} from KV`);
      }
      
      return deleted;
    }
  }

  static async findById(id: string): Promise<Gear | null> {
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        const response = await fetch(`/api/gears/${id}`);
        if (!response.ok) {
          // If not found on server, try localStorage as fallback
          try {
            const savedGears = localStorage.getItem('gears');
            if (savedGears) {
              const gears = JSON.parse(savedGears);
              const localGearData = gears.find((g: {id: string}) => g.id === id);
              
              if (localGearData) {
                console.log(`Found gear ${id} in localStorage`);
                
                // Also create it on the server for future requests
                const createResponse = await fetch('/api/gears', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(localGearData),
                });
                
                if (!createResponse.ok) {
                  console.warn(`Failed to migrate gear ${id} to server:`, await createResponse.text());
                }
                
                return new Gear(localGearData);
              }
            }
          } catch (error) {
            console.error("Error loading gear from localStorage:", error);
          }
          return null;
        }
        
        const gearData = await response.json();
        return new Gear(gearData);
      } catch (error) {
        console.error(`Error fetching gear ${id}:`, error);
        return null;
      }
    } else {
      // Server-side: Use KV directly
      const gearData = await getFromKV<GearData>(`gear:${id}`);
      
      if (gearData) {
        console.log(`Found gear ${id} in KV store`);
        return new Gear(gearData);
      }
      
      // Return null if gear not found
      return null;
    }
  }
  
  // Get all gears from the store
  static async findAll(): Promise<Gear[]> {
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        const response = await fetch('/api/gears');
        if (!response.ok) {
          // If server fails, try localStorage as fallback
          try {
            const savedGearsStr = localStorage.getItem('gears');
            if (savedGearsStr) {
              const savedGears = JSON.parse(savedGearsStr);
              return savedGears.map((gearData: GearData) => new Gear(gearData));
            }
          } catch (error) {
            console.error("Error loading gears from localStorage:", error);
          }
          return [];
        }
        
        const gearDataList = await response.json();
        return gearDataList.map((gearData: GearData) => new Gear(gearData));
      } catch (error) {
        console.error("Error fetching gears:", error);
        
        // Fallback to localStorage
        try {
          const savedGearsStr = localStorage.getItem('gears');
          if (savedGearsStr) {
            const savedGears = JSON.parse(savedGearsStr);
            return savedGears.map((gearData: GearData) => new Gear(gearData));
          }
        } catch (error) {
          console.error("Error loading gears from localStorage:", error);
        }
        
        return [];
      }
    } else {
      // Server-side: Use KV directly
      const gears: Gear[] = [];
      
      // Get all gears from KV
      const keys = await listKeysFromKV('gear:*');
      
      for (const key of keys) {
        const gearData = await getFromKV<GearData>(key);
        if (gearData) {
          gears.push(new Gear(gearData));
        }
      }
      
      return gears;
    }
  }

  async save(): Promise<void> {
    this.data.updatedAt = Date.now();
    
    // Debug log when saving with a label
    if (this.data.label) {
      console.log(`LABEL DEBUG: save() called with label = "${this.data.label}"`);
    }
    
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        // Check if the gear already exists
        const checkResponse = await fetch(`/api/gears/${this.data.id}`);
        
        if (checkResponse.ok) {
          // Update existing gear
          console.log(`LABEL DEBUG: Updating existing gear, data has label = "${this.data.label || 'none'}"`);
          
          const updateResponse = await fetch(`/api/gears/${this.data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.data),
          });
          
          if (!updateResponse.ok) {
            console.warn(`Failed to update gear ${this.data.id}:`, await updateResponse.text());
          } else {
            console.log(`LABEL DEBUG: Successfully updated gear with new data`);
          }
        } else {
          // Create new gear
          console.log(`LABEL DEBUG: Creating new gear, data has label = "${this.data.label || 'none'}"`);
          
          const createResponse = await fetch('/api/gears', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.data),
          });
          
          if (!createResponse.ok) {
            console.warn(`Failed to create gear ${this.data.id}:`, await createResponse.text());
          }
        }
        
        // For backward compatibility, also update localStorage
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
      } catch (error) {
        console.error(`Error saving gear ${this.data.id}:`, error);
        
        // Fallback to localStorage only
        try {
          const savedGearsStr = localStorage.getItem('gears');
          const savedGears = savedGearsStr ? JSON.parse(savedGearsStr) : [];
          
          const gearIndex = savedGears.findIndex((g: {id: string}) => g.id === this.data.id);
          
          if (gearIndex >= 0) {
            savedGears[gearIndex] = { ...this.data };
          } else {
            savedGears.push({ ...this.data });
          }
          
          localStorage.setItem('gears', JSON.stringify(savedGears));
        } catch (storageError) {
          console.error("Error saving gear to localStorage:", storageError);
        }
      }
    } else {
      // Server-side: Use KV directly
      await saveToKV(`gear:${this.data.id}`, this.data);
      console.log(`Saved gear to KV: ${this.data.id}`);
    }
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

  get exampleInputs() {
    return this.data.exampleInputs || [];
  }

  get label() {
    return this.data.label || `Gear ${this.data.id.slice(0, 8)}`;
  }

  async setLabel(label: string) {
    console.log(`LABEL DEBUG: setLabel called with label: "${label}" (length: ${label.length}, type: ${typeof label})`);
    this.data.label = label;
    await this.save();
    console.log(`LABEL DEBUG: setLabel completed, current label: "${this.data.label}"`);
  }
  
  // Setters
  async setMessages(messages: Message[]) {
    this.data.messages = messages;
    await this.save();
  }
  
  async setOutputUrls(urls: string[]) {
    this.data.outputUrls = urls;
    await this.save();
  }
  
  async setExampleInputs(examples: ExampleInput[]) {
    this.data.exampleInputs = examples;
    await this.save();
  }

  async addExampleInput(name: string, input: GearInput): Promise<ExampleInput> {
    if (!this.data.exampleInputs) {
      this.data.exampleInputs = [];
    }
    
    // Try to parse input as JSON if it's a string that looks like JSON
    let processedInput: GearInput = input;
    if (typeof input === 'string') {
      try {
        // Check if input looks like JSON
        if (input.trim().startsWith('{') || input.trim().startsWith('[')) {
          processedInput = JSON.parse(input);
        }
      } catch (error) {
        // If parsing fails, keep the original string
        console.log("Input couldn't be parsed as JSON, using as string:", error);
        processedInput = input;
      }
    }
    
    const example: ExampleInput = {
      id: crypto.randomUUID(),
      name,
      input: processedInput,
    };
    
    this.data.exampleInputs.push(example);
    await this.save();
    
    // Sync with server
    if (typeof window !== 'undefined') {
      try {
        const updateResponse = await fetch(`/api/gears/${this.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exampleInputs: this.data.exampleInputs
          }),
        });
        
        if (!updateResponse.ok) {
          console.warn("Failed to update example inputs on server:", await updateResponse.text());
        }
      } catch (err) {
        console.warn("Error updating example inputs on server:", err);
      }
    }
    
    return example;
  }

  async updateExampleInput(id: string, updates: Partial<ExampleInput>): Promise<ExampleInput | null> {
    if (!this.data.exampleInputs) {
      return null;
    }
    
    const index = this.data.exampleInputs.findIndex(example => example.id === id);
    if (index === -1) {
      return null;
    }
    
    // Process input if provided and is a string that looks like JSON
    if (updates.input && typeof updates.input === 'string') {
      try {
        // Check if input looks like JSON
        if (updates.input.trim().startsWith('{') || updates.input.trim().startsWith('[')) {
          updates = {
            ...updates,
            input: JSON.parse(updates.input as string)
          };
        }
      } catch (error) {
        // If parsing fails, keep the original string
        console.log("Input couldn't be parsed as JSON, using as string:", error);
      }
    }
    
    this.data.exampleInputs[index] = {
      ...this.data.exampleInputs[index],
      ...updates
    };
    
    await this.save();
    
    // Sync with server
    if (typeof window !== 'undefined') {
      try {
        const updateResponse = await fetch(`/api/gears/${this.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exampleInputs: this.data.exampleInputs
          }),
        });
        
        if (!updateResponse.ok) {
          console.warn("Failed to update example inputs on server:", await updateResponse.text());
        }
      } catch (err) {
        console.warn("Error updating example inputs on server:", err);
      }
    }
    
    return this.data.exampleInputs[index];
  }

  async deleteExampleInput(id: string): Promise<boolean> {
    if (!this.data.exampleInputs) {
      return false;
    }
    
    const initialLength = this.data.exampleInputs.length;
    this.data.exampleInputs = this.data.exampleInputs.filter(example => example.id !== id);
    
    if (this.data.exampleInputs.length !== initialLength) {
      await this.save();
      
      // Sync with server
      if (typeof window !== 'undefined') {
        try {
          const updateResponse = await fetch(`/api/gears/${this.data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              exampleInputs: this.data.exampleInputs
            }),
          });
          
          if (!updateResponse.ok) {
            console.warn("Failed to update example inputs on server:", await updateResponse.text());
          }
        } catch (err) {
          console.warn("Error updating example inputs on server:", err);
        }
      }
      
      return true;
    }
    
    return false;
  }

  async processExampleInput(id: string): Promise<ExampleInput | null> {
    if (!this.data.exampleInputs) {
      return null;
    }
    
    const example = this.data.exampleInputs.find(ex => ex.id === id);
    if (!example) {
      return null;
    }
    
    try {
      // Get output directly from LLM without going through the process method
      // to avoid forwarding to output gears when processing examples
      const output = await this.processWithLLM(example.input);
      
      // Update the example with the new output
      example.output = output;
      example.lastProcessed = Date.now();
      
      await this.save();
      
      // Sync with server
      if (typeof window !== 'undefined') {
        try {
          const updateResponse = await fetch(`/api/gears/${this.data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              exampleInputs: this.data.exampleInputs
            }),
          });
          
          if (!updateResponse.ok) {
            console.warn("Failed to update processed example on server:", await updateResponse.text());
          }
        } catch (err) {
          console.warn("Error updating processed example on server:", err);
        }
      }
      
      return example;
    } catch (error) {
      console.error(`Error processing example input ${id}:`, error);
      throw error;
    }
  }

  async processAllExamples(): Promise<ExampleInput[]> {
    if (!this.data.exampleInputs || this.data.exampleInputs.length === 0) {
      return [];
    }
    
    const results: ExampleInput[] = [];
    
    for (const example of this.data.exampleInputs) {
      try {
        // Get output directly from LLM without going through the process method
        // to avoid forwarding to output gears when processing examples
        const output = await this.processWithLLM(example.input);
        
        // Update the example with the new output
        example.output = output;
        example.lastProcessed = Date.now();
        
        results.push(example);
      } catch (error) {
        console.error(`Error processing example input ${example.id}:`, error);
        // Continue processing other examples even if one fails
      }
    }
    
    await this.save();
    
    // Sync with server
    if (typeof window !== 'undefined') {
      try {
        const updateResponse = await fetch(`/api/gears/${this.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exampleInputs: this.data.exampleInputs
          }),
        });
        
        if (!updateResponse.ok) {
          console.warn("Failed to update processed examples on server:", await updateResponse.text());
        }
      } catch (err) {
        console.warn("Error updating processed examples on server:", err);
      }
    }
    
    return results;
  }

  async addMessage({ role, content }: { role: Role; content: string }) {
    console.log(`LABEL DEBUG: addMessage called with role ${role}`);
    
    await this.chat.addMessage({ role, content });
    // Note: we don't need to push to data.messages since the GearChat maintains the same reference
    await this.save();
    
    // Explicitly update on the server as well to ensure consistency
    if (typeof window !== 'undefined') {
      try {
        // First check if gear exists on server
        const checkResponse = await fetch(`/api/gears/${this.data.id}`);
        
        if (checkResponse.ok) {
          // Gear exists, update it
          console.log(`Updating gear ${this.data.id} messages on server`);
          const updateResponse = await fetch(`/api/gears/${this.data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: this.data.messages
            }),
          });
          
          if (!updateResponse.ok) {
            console.warn(`Failed to update gear ${this.data.id} messages:`, await updateResponse.text());
          }
        } else {
          // Gear doesn't exist, create it
          console.log(`Creating missing gear ${this.data.id} on server with messages`);
          const createResponse = await fetch('/api/gears', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: this.data.id,
              messages: this.data.messages,
              outputUrls: this.data.outputUrls,
              exampleInputs: this.data.exampleInputs
            }),
          });
          
          if (!createResponse.ok) {
            console.warn(`Failed to create gear ${this.data.id} on server:`, await createResponse.text());
          }
        }
      } catch (err) {
        console.warn("Error updating gear messages on server:", err);
      }
    }

    // Generate a new label if this completes a message exchange (user then assistant)
    if (role === 'assistant' && this.data.messages.length >= 2) {
      console.log(`LABEL DEBUG: Detected assistant message following other messages`);
      const previousMessage = this.data.messages[this.data.messages.length - 2];
      console.log(`LABEL DEBUG: Previous message role: ${previousMessage.role}`);
      
      if (previousMessage.role === 'user') {
        console.log(`LABEL DEBUG: Found message exchange pattern (user→assistant), calling generateLabel()`);
        const newLabel = await this.generateLabel();
        console.log(`LABEL DEBUG: generateLabel() returned: "${newLabel}"`);
        
        // Log current gear state after label generation
        console.log(`LABEL DEBUG: After label generation, gear label = "${this.data.label}"`);
        
        // Get the saved gear to make sure the label was persisted
        if (typeof window !== 'undefined') {
          try {
            const checkResponse = await fetch(`/api/gears/${this.data.id}`);
            if (checkResponse.ok) {
              const serverGear = await checkResponse.json();
              console.log(`LABEL DEBUG: Server gear label after save: "${serverGear.label}"`);
            }
          } catch (err) {
            console.warn("Error checking server gear label:", err);
          }
        }
      }
    }
    
    // If role is "system" or "user" and we have example inputs, process them all when instructions change
    if ((role === "system" || role === "user") && this.data.exampleInputs && this.data.exampleInputs.length > 0) {
      // Process all examples with the updated instructions
      await this.processAllExamples();
    }
  }
  
  async generateLabel(): Promise<string> {
    try {
      console.log(`LABEL DEBUG: Generating label for gear ${this.id}`);
      console.log(`LABEL DEBUG: Current messages:`, this.data.messages);
      
      // Generate a concise label based on the gear's messages
      const prompt = `Based on this conversation, generate a concise 1-3 word label that describes what transformation this gear performs. The label should be short and descriptive like "french translator" or "slack conversation summarizer". Only respond with the label text, nothing else.

Example conversations and labels:
- Conversation about translating text to French → "French Translator"
- Conversation about summarizing Slack messages → "Slack Summarizer"
- Conversation about extracting key information from emails → "Email Extractor"

Here is the conversation:
${this.data.messages.map(m => `${m.role}: ${m.content}`).join('\n')}
`;

      console.log(`LABEL DEBUG: Sending prompt for label generation:`, prompt.substring(0, 200) + '...');
      
      // Use the LLM to generate a label
      const response = await this.processWithSpecialPrompt(prompt);
      console.log(`LABEL DEBUG: Got raw response for label:`, response);
      
      // Clean the response if needed (remove quotes, etc.)
      let cleanedLabel;
      
      // Handle the case where we're getting SSE metadata in the response
      if (response.includes('f:{"message') || 
          response.includes('e:{"finish') || 
          response.includes('d:{"finish')) {
        
        console.log("LABEL DEBUG: Detected SSE metadata in response, extracting text parts");
        console.log("LABEL DEBUG: Raw response:", response);
        
        // Try approach 1: Extract text segments by looking for completions
        const textSegments = [];
        const regex = /0:"([^"]+)"/g;
        let match;
        
        while ((match = regex.exec(response)) !== null) {
          textSegments.push(match[1]);
          console.log(`LABEL DEBUG: Found text segment: "${match[1]}"`);
        }
        
        if (textSegments.length > 0) {
          // Join the segments without spaces (the spaces are already in the text)
          const rawText = textSegments.join('');
          console.log("LABEL DEBUG: Raw joined text:", rawText);
          
          // Clean up any potential weird spacing issues
          cleanedLabel = rawText
            .replace(/\s+/g, ' ')  // Convert multiple spaces to single space
            .trim();
            
          console.log("LABEL DEBUG: Normalized spacing:", cleanedLabel);
        } else {
          // Try approach 2: Look for a clean text block in the response
          const cleanTextMatch = response.match(/"([^"]{3,})"/);
          if (cleanTextMatch && cleanTextMatch[1]) {
            cleanedLabel = cleanTextMatch[1].trim();
            console.log("LABEL DEBUG: Found clean text block:", cleanedLabel);
          } else {
            // Fallback to basic cleaning
            cleanedLabel = response.replace(/^["']|["']$/g, '').trim();
            console.log("LABEL DEBUG: Using fallback cleaning:", cleanedLabel);
          }
        }
      } else {
        // Normal response - just clean and trim
        cleanedLabel = response.replace(/^["']|["']$/g, '').trim();
        console.log("LABEL DEBUG: Normal response cleaning:", cleanedLabel);
      }
      
      // Fix any unexpected escaping (like backslashes) in the label
      cleanedLabel = cleanedLabel.replace(/\\+/g, '');
      console.log(`LABEL DEBUG: Label after escape character cleanup: "${cleanedLabel}"`);
      
      // Ensure we're not getting JSON-like responses with quotes
      if (cleanedLabel.includes('"') && (cleanedLabel.startsWith('{') || cleanedLabel.startsWith('['))) {
        try {
          // If it's valid JSON, try to extract a string from it
          const parsed = JSON.parse(cleanedLabel);
          if (typeof parsed === 'string') {
            cleanedLabel = parsed;
          } else if (typeof parsed === 'object' && parsed !== null) {
            // Try to get the first string value from the object
            const firstValue = Object.values(parsed).find(v => typeof v === 'string');
            if (firstValue) {
              cleanedLabel = firstValue;
            }
          }
        } catch (e) {
          // Not valid JSON, continue with current value
          console.warn("LABEL DEBUG: Failed to parse potential JSON label:", e);
        }
      }
      
      console.log(`LABEL DEBUG: Cleaned label: "${cleanedLabel}"`);
      
      // Update the label
      this.data.label = cleanedLabel;
      console.log(`LABEL DEBUG: Set gear.data.label = "${this.data.label}"`);
      
      await this.save();
      console.log(`LABEL DEBUG: Saved gear with new label "${this.data.label}"`);
      
      return cleanedLabel;
    } catch (error) {
      console.error("Error generating label:", error);
      return this.label; // Return existing label if generation fails
    }
  }
  
  private async processWithSpecialPrompt(prompt: string): Promise<string> {
    try {
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
      console.log(`Calling label API for gear ${this.id}`);
      
      // Use the label endpoint with the prompt
      const controller = new AbortController();
      const signal = controller.signal;
      
      try {
        const response = await fetch(`/api/gears/${this.id}/label`, {
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
        
        // Handle potential streaming response
        if (response.headers.get("content-type")?.includes("text/event-stream")) {
          // Handle streaming response
          let accumulatedContent = "";
          
          try {
            const reader = response.body?.getReader();
            if (!reader) {
              console.warn("No reader available for stream");
              return "Error reading stream";
            }
            
            const decoder = new TextDecoder();
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value);
              console.log("Stream chunk received:", chunk.substring(0, 50) + "...");
              
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6).trim();
                  if (data === "[DONE]") break;
                  
                  try {
                    // Skip empty data
                    if (!data) continue;
                    
                    const parsed = JSON.parse(data);
                    if (parsed.type === "text" && parsed.value) {
                      accumulatedContent += parsed.value;
                    }
                  } catch (e) {
                    console.warn("Error parsing SSE data:", e, "Raw data:", data);
                    // For malformed JSON, just append the raw text instead of failing
                    if (data && !data.includes('{') && !data.includes('[')) {
                      accumulatedContent += data;
                    }
                  }
                }
              }
            }
            
            return accumulatedContent;
          } catch (streamError) {
            console.error("Error processing stream:", streamError);
            return "Error processing stream response";
          }
        } else {
          // Regular JSON response
          try {
            const text = await response.text();
            console.log("Raw response:", text.substring(0, 100) + "...");
            
            try {
              const result = JSON.parse(text);
              return result.content || result.text || text;
            } catch (jsonError) {
              console.warn("Failed to parse JSON response, using raw text:", jsonError);
              return text; // Use raw text if JSON parsing fails
            }
          } catch (textError) {
            console.error("Error getting response text:", textError);
            return "Error reading response";
          }
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
      
      // For processing examples, use direct API call (not chat endpoint)
      if (input !== undefined) {
        console.log(`Processing input directly for gear ${this.id}`);
        try {
          const response = await fetch(`/api/gears/${this.id}`, {
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
          
          try {
            // Create a reader for the response body
            const reader = response.body?.getReader();
            if (!reader) {
              console.warn("No reader available for stream");
              return "Error reading stream";
            }
            
            const decoder = new TextDecoder();
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              // Decode the chunk
              const chunk = decoder.decode(value);
              console.log("Stream chunk received:", chunk.substring(0, 50) + "...");
              
              // Simple parsing of SSE format
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6).trim();
                  if (data === "[DONE]") {
                    // End of stream
                    break;
                  }
                  
                  // Skip empty data
                  if (!data) continue;
                  
                  try {
                    // Parse the JSON in the data
                    const parsed = JSON.parse(data);
                    if (parsed.type === "text" && parsed.value) {
                      accumulatedContent += parsed.value;
                    }
                  } catch (e) {
                    console.warn("Error parsing SSE data:", e, "Raw data:", data);
                    // For malformed JSON, just append the raw text if it looks like plain text
                    if (data && !data.includes('{') && !data.includes('[')) {
                      accumulatedContent += data;
                    }
                  }
                }
              }
            }
            
            console.log("Final accumulated content:", accumulatedContent);
            return accumulatedContent;
          } catch (streamError) {
            console.error("Error processing stream:", streamError);
            return "Error processing stream response";
          }
        } else {
          // Regular JSON response
          console.log("Got regular JSON response");
          
          try {
            const text = await response.text();
            console.log("Raw response:", text.substring(0, 100) + "...");
            
            try {
              const result = JSON.parse(text);
              
              if (!result.content && !result.text) {
                console.warn("Received potentially empty content from LLM response");
                // Return the raw text if we can't find content or text fields
                return text;
              }
              
              return result.content || result.text;
            } catch (jsonError) {
              console.warn("Failed to parse JSON response, using raw text:", jsonError);
              return text; // Use raw text if JSON parsing fails
            }
          } catch (textError) {
            console.error("Error getting response text:", textError);
            return "Error reading response";
          }
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
        // Ensure the URL is absolute by checking if it's a relative URL
        let fullUrl = url;
        if (url.startsWith('/')) {
          // Convert relative URL to absolute URL using the origin
          const origin = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          fullUrl = `${origin}${url}`;
          console.log(`Converting relative URL ${url} to absolute URL ${fullUrl}`);
        }
        
        const response = await fetch(fullUrl, {
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
