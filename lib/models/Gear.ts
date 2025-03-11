import { saveToKV, getFromKV, deleteFromKV, listKeysFromKV } from '../kv';
import { GearChat } from "./GearChat";
import { Message, Role, GearInput, GearOutput } from "./types";
import { debugLog, isDebugLoggingEnabled } from "../utils";

// No in-memory store - using Vercel KV exclusively for serverless architecture

export interface ExampleInput {
  id: string;
  name: string;
  input: GearInput;
  output?: GearOutput;
  lastProcessed?: number;
}

export interface GearSource {
  id: string;
  label: string;
}

export interface GearLogEntry {
  timestamp: number;
  input: GearInput;
  output?: GearOutput;
  source?: GearSource | string;
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
  log?: GearLogEntry[];
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
      log: data.log || [],
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
    
    // Keep only critical logs for production, use debug logging for verbose output
    console.log(`Saving gear ${this.data.id}`);
    
    // Use conditional debug logging for verbose output
    debugLog("GEAR-SAVE", `Saving gear ${this.data.id} with ${this.data.log?.length || 0} log entries`);
    
    // Debug log when saving with a label (only in debug mode)
    if (this.data.label) {
      debugLog("LABEL", `save() called with label = "${this.data.label}"`);
    }
    
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        // Check if the gear already exists
        const checkResponse = await fetch(`/api/gears/${this.data.id}`);
        
        if (checkResponse.ok) {
          // Update existing gear
          debugLog("LABEL", `Updating existing gear, data has label = "${this.data.label || 'none'}"`);
          
          const updateResponse = await fetch(`/api/gears/${this.data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.data),
          });
          
          if (!updateResponse.ok) {
            console.warn(`Failed to update gear ${this.data.id}:`, await updateResponse.text());
          } else {
            debugLog("LABEL", `Successfully updated gear with new data`);
          }
        } else {
          // Create new gear
          debugLog("LABEL", `Creating new gear, data has label = "${this.data.label || 'none'}"`);
          
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
      try {
        console.log(`Saving gear ${this.data.id} to KV`);
        debugLog("GEAR-SAVE", `Server side: Saving gear ${this.data.id} to KV with ${this.data.log?.length || 0} log entries`);
        
        await saveToKV(`gear:${this.data.id}`, this.data);
        debugLog("GEAR-SAVE", `Successfully saved gear ${this.data.id} to KV`);
      } catch (kvError) {
        console.error(`Error saving to KV:`, kvError);
      }
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
  
  get log() {
    return this.data.log || [];
  }

  async clearLog() {
    console.log(`Clearing log for gear ${this.id}`);
    this.data.log = [];
    
    // Debug log for verification
    debugLog("LOG", `Log array length after clearing: ${this.data.log.length}`);
    
    // Save to persistent storage
    await this.save();
    
    // If we're in the browser, also explicitly update via API
    if (typeof window !== 'undefined') {
      try {
        debugLog("LOG", `Explicitly updating gear ${this.id} via API to clear logs`);
        const response = await fetch(`/api/gears/${this.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            log: []
          }),
        });
        
        if (!response.ok) {
          console.error(`Failed to clear log via API: ${response.status}`);
        } else {
          debugLog("LOG", `Successfully cleared log via API`);
        }
      } catch (err) {
        console.error("Error clearing log via API:", err);
      }
    }
  }
  
  async setLog(logEntries: GearLogEntry[]) {
    console.log(`Setting log for gear ${this.id} with ${logEntries.length} entries`);
    this.data.log = logEntries;
    await this.save();
  }

  async setLabel(label: string) {
    console.log(`Setting label for gear ${this.id}: "${label}"`);
    debugLog("LABEL", `setLabel called with label: "${label}" (length: ${label.length}, type: ${typeof label})`);
    this.data.label = label;
    await this.save();
    debugLog("LABEL", `setLabel completed, current label: "${this.data.label}"`);
    
    // Update the description of any patches containing this gear
    await this.updatePatchDescriptions();
  }
  
  /**
   * Find all patches that contain this gear and update their descriptions
   * Called after gear label changes to ensure patch descriptions reflect current functionality
   */
  private async updatePatchDescriptions() {
    console.log(`Updating patch descriptions after label change for gear ${this.id}`);
    await this.updateContainingPatchDescriptions();
  }
  
  // Setters
  async setMessages(messages: Message[]) {
    this.data.messages = messages;
    await this.save();
    
    // Updates to messages can change gear functionality, so update patch descriptions
    await this.updateContainingPatchDescriptions();
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
      // For examples, directly process with the API using forward=false and create_log=false
      // to prevent both forwarding outputs and creating log entries when processing examples
      if (typeof window !== 'undefined') {
        // In browser, use the API with forward=false and create_log=false
        try {
          const response = await fetch(`/api/gears/${this.data.id}?forward=false&create_log=false`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'example',
              message: example.input
            })
          });
          
          if (!response.ok) {
            throw new Error(`Failed to process example: ${await response.text()}`);
          }
          
          const result = await response.json();
          
          // Update the example with the new output
          example.output = result.output;
          example.lastProcessed = Date.now();
          
          // Save the updated example
          await this.save();
        } catch (error) {
          console.error(`Error processing example with API: ${error}`);
          throw error;
        }
      } else {
        // Server-side: just use the LLM directly
        const output = await this.processWithLLM(example.input);
        
        // Update the example with the new output
        example.output = output;
        example.lastProcessed = Date.now();
        
        await this.save();
      }
      
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
        // Process each example individually with no_forward=true
        await this.processExampleInput(example.id);
        results.push(example);
      } catch (error) {
        console.error(`Error processing example input ${example.id}:`, error);
        // Continue processing other examples even if one fails
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
      debugLog("LABEL", `Detected assistant message following other messages`);
      const previousMessage = this.data.messages[this.data.messages.length - 2];
      debugLog("LABEL", `Previous message role: ${previousMessage.role}`);
      
      if (previousMessage.role === 'user') {
        console.log(`Generating label for gear ${this.id} after message exchange`);
        debugLog("LABEL", `Found message exchange pattern (user→assistant), calling generateLabel()`);
        const newLabel = await this.generateLabel();
        debugLog("LABEL", `generateLabel() returned: "${newLabel}"`);
        
        // Update descriptions of patches that contain this gear
        await this.updateContainingPatchDescriptions();
        
        // Only run verification checks in debug mode
        if (isDebugLoggingEnabled()) {
          // Log current gear state after label generation
          debugLog("LABEL", `After label generation, gear label = "${this.data.label}"`);
          
          // Get the saved gear to make sure the label was persisted
          if (typeof window !== 'undefined') {
            try {
              const checkResponse = await fetch(`/api/gears/${this.data.id}`);
              if (checkResponse.ok) {
                const serverGear = await checkResponse.json();
                debugLog("LABEL", `Server gear label after save: "${serverGear.label}"`);
              }
            } catch (err) {
              console.warn("Error checking server gear label:", err);
            }
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
      console.log(`Generating label for gear ${this.id}`);
      debugLog("LABEL", `Current messages for label generation:`, this.data.messages);
      
      // Generate a concise label based on the gear's messages
      const prompt = `Based on this conversation, generate a concise 1-3 word label that describes what transformation this gear performs. The label should be short and descriptive like "french translator" or "slack conversation summarizer". Only respond with the label text, nothing else.

Example conversations and labels:
- Conversation about translating text to French → "French Translator"
- Conversation about summarizing Slack messages → "Slack Summarizer"
- Conversation about extracting key information from emails → "Email Extractor"

Here is the conversation:
${this.data.messages.map(m => `${m.role}: ${m.content}`).join('\n')}
`;

      debugLog("LABEL", `Sending prompt for label generation: ${prompt.substring(0, 200)}...`);
      
      // Use the LLM to generate a label
      const response = await this.processWithSpecialPrompt(prompt);
      debugLog("LABEL", `Got raw response for label: ${response}`);
      
      // Clean the response if needed (remove quotes, etc.)
      let cleanedLabel;
      
      // Handle the case where we're getting SSE metadata in the response
      if (response.includes('f:{"message') || 
          response.includes('e:{"finish') || 
          response.includes('d:{"finish')) {
        
        debugLog("LABEL", "Detected SSE metadata in response, extracting text parts");
        
        // Try approach 1: Extract text segments by looking for completions
        const textSegments = [];
        const regex = /0:"([^"]+)"/g;
        let match;
        
        while ((match = regex.exec(response)) !== null) {
          textSegments.push(match[1]);
          debugLog("LABEL", `Found text segment: "${match[1]}"`);
        }
        
        if (textSegments.length > 0) {
          // Join the segments without spaces (the spaces are already in the text)
          const rawText = textSegments.join('');
          debugLog("LABEL", `Raw joined text: ${rawText}`);
          
          // Clean up any potential weird spacing issues
          cleanedLabel = rawText
            .replace(/\s+/g, ' ')  // Convert multiple spaces to single space
            .trim();
            
          debugLog("LABEL", `Normalized spacing: ${cleanedLabel}`);
        } else {
          // Try approach 2: Look for a clean text block in the response
          const cleanTextMatch = response.match(/"([^"]{3,})"/);
          if (cleanTextMatch && cleanTextMatch[1]) {
            cleanedLabel = cleanTextMatch[1].trim();
            debugLog("LABEL", `Found clean text block: ${cleanedLabel}`);
          } else {
            // Fallback to basic cleaning
            cleanedLabel = response.replace(/^["']|["']$/g, '').trim();
            debugLog("LABEL", `Using fallback cleaning: ${cleanedLabel}`);
          }
        }
      } else {
        // Normal response - just clean and trim
        cleanedLabel = response.replace(/^["']|["']$/g, '').trim();
        debugLog("LABEL", `Normal response cleaning: ${cleanedLabel}`);
      }
      
      // Fix any unexpected escaping (like backslashes) in the label
      cleanedLabel = cleanedLabel.replace(/\\+/g, '');
      debugLog("LABEL", `Label after escape character cleanup: "${cleanedLabel}"`);
      
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
          debugLog("LABEL", `Failed to parse potential JSON label: ${e}`);
        }
      }
      
      console.log(`Generated label: "${cleanedLabel}"`);
      
      // Update the label
      this.data.label = cleanedLabel;
      debugLog("LABEL", `Set gear.data.label = "${this.data.label}"`);
      
      await this.save();
      debugLog("LABEL", `Saved gear with new label "${this.data.label}"`);
      
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
  
  /**
   * Updates the descriptions of all patches containing this gear.
   * This is triggered after significant changes to this gear.
   */
  async updateContainingPatchDescriptions(): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        // Find all patches
        const response = await fetch('/api/patches');
        if (!response.ok) return;
        
        const patches = await response.json();
        
        // For each patch, check if it contains this gear
        for (const patchData of patches) {
          try {
            // Load the full patch data
            const patchResponse = await fetch(`/api/patches/${patchData.id}`);
            if (!patchResponse.ok) continue;
            
            const fullPatchData = await patchResponse.json();
            
            // Check if any nodes in this patch use this gear
            const containsThisGear = fullPatchData.nodes?.some(
              (node: any) => node.data?.gearId === this.id
            );
            
            if (containsThisGear) {
              console.log(`Updating description for patch ${patchData.id} due to gear changes`);
              
              // Trigger description regeneration via the API
              await fetch(`/api/patches/${patchData.id}?regenerate_description=true`);
            }
          } catch (error) {
            console.error(`Error checking patch ${patchData.id} for gear:`, error);
          }
        }
      } catch (error) {
        console.error("Error updating patch descriptions after gear changes:", error);
      }
    }
  }

  async processWithoutLogging(source: string, input: GearInput): Promise<GearOutput> {
    // Store the input in inputs dictionary
    if (!this.data.inputs) {
      this.data.inputs = {};
    }
    this.data.inputs[source] = input;
    this.data.updatedAt = Date.now();
    await this.save();
    
    // Process the input using LLM
    const output = await this.processWithLLM(input);
    
    // Store the output
    this.data.output = output;
    await this.save();
    
    return output;
  }
  
  // Keep for backward compatibility but modify to use processWithoutLogging
  async processInput(source: string, input: GearInput, sourceLabel?: string): Promise<GearOutput> {
    console.log("WARNING: processInput is deprecated, use processWithoutLogging instead");
    return this.processWithoutLogging(source, input);
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
      let output;
      
      if (input !== undefined) {
        // For backward compatibility, if input is provided directly,
        // process just that input directly
        output = await this.processWithLLM(input);
        this.data.output = output;
        await this.save();
        return output;
      }
      
      // Process all inputs from the inputs dictionary
      output = await this.processWithLLM();
      this.data.output = output;
      await this.save();
      return output;
    } catch (error) {
      console.error(`Error processing: ${error}`);
      throw error;
    }
  }
  
  // New method to emit processing state events
  async emitProcessingState(isProcessing: boolean, details?: any) {
    // This will be called during LLM processing
    try {
      // Only in browser context
      if (typeof window !== 'undefined') {
        console.log(`Emitting processing state for gear ${this.id}: ${isProcessing}`);
        // Nothing to do here - the client will subscribe directly
      } else {
        // In server context, call the SSE endpoint to broadcast event
        try {
          const { sendGearStatusEvent } = await import('@/app/api/gears/[gearId]/status/route');
          await sendGearStatusEvent(this.id, isProcessing ? 'processing' : 'complete', details);
        } catch (e) {
          console.error("Error importing or calling sendGearStatusEvent:", e);
        }
      }
    } catch (error) {
      console.error("Error emitting gear processing state:", error);
    }
  }

  private async processWithLLM(input?: GearInput): Promise<GearOutput> {
    try {
      // Emit processing started
      await this.emitProcessingState(true);
      
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
          
          // Emit processing completed
          await this.emitProcessingState(false);
          return response.text;
        } catch (err) {
          // Emit error state
          await this.emitProcessingState(false, { error: err instanceof Error ? err.message : "Unknown error" });
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
            // Emit error state
            await this.emitProcessingState(false, { error: `Failed to process input: ${response.status} ${text}` });
            throw new Error(`Failed to process input: ${response.status} ${text}`);
          }
          
          try {
            const text = await response.text();
            console.log("Raw API response:", text.substring(0, 100) + "...");
            
            try {
              const result = JSON.parse(text);
              // Emit processing completed
              await this.emitProcessingState(false);
              return result.output || text;
            } catch (jsonError) {
              console.warn("Failed to parse JSON response from API, using raw text:", jsonError);
              // Emit processing completed
              await this.emitProcessingState(false);
              return text;
            }
          } catch (textError) {
            console.error("Error reading API response text:", textError);
            // Emit error state
            await this.emitProcessingState(false, { error: "Error reading API response" });
            return "Error reading API response";
          }
        } catch (error) {
          console.error("Error in direct API call:", error);
          // Emit error state
          await this.emitProcessingState(false, { error: error instanceof Error ? error.message : "Unknown error" });
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
          // Emit error state
          await this.emitProcessingState(false, { error: `Failed to process with LLM: ${response.status} ${text}` });
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
              // Emit error state
              await this.emitProcessingState(false, { error: "Error reading stream" });
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
            // Emit processing completed
            await this.emitProcessingState(false);
            return accumulatedContent;
          } catch (streamError) {
            console.error("Error processing stream:", streamError);
            // Emit error state
            await this.emitProcessingState(false, { error: "Error processing stream response" });
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
                // Emit processing completed
                await this.emitProcessingState(false);
                return text;
              }
              
              // Emit processing completed
              await this.emitProcessingState(false);
              return result.content || result.text;
            } catch (jsonError) {
              console.warn("Failed to parse JSON response, using raw text:", jsonError);
              // Emit processing completed
              await this.emitProcessingState(false);
              return text; // Use raw text if JSON parsing fails
            }
          } catch (textError) {
            console.error("Error getting response text:", textError);
            // Emit error state
            await this.emitProcessingState(false, { error: "Error reading response" });
            return "Error reading response";
          }
        }
      } catch (error) {
        console.error("Error in LLM API call:", error);
        // Emit error state
        await this.emitProcessingState(false, { error: error instanceof Error ? error.message : "Unknown error" });
        throw error;
      } finally {
        // Clean up the controller
        controller.abort();
      }
    } catch (error) {
      console.error("Error processing with LLM:", error);
      // Emit error state if not already emitted
      await this.emitProcessingState(false, { error: error instanceof Error ? error.message : "Unknown error" });
      throw error;
    }
  }

  async forwardOutputToGears(output: GearOutput): Promise<void> {
    // If there are no output gears, just return early
    if (!this.outputUrls || this.outputUrls.length === 0) {
      return;
    }
    
    // Log essential information
    console.log(`Forwarding from gear ${this.id} to ${this.outputUrls.length} connected gears`);
    
    // Additional debug information
    debugLog("FORWARDING", `Gear ${this.id} outputUrls: ${JSON.stringify(this.outputUrls)}`);
    
    for (const url of this.outputUrls) {
      const newMessageId = crypto.randomUUID();
      try {
        // Ensure the URL is absolute by checking if it's a relative URL
        let fullUrl = url;
        
        // REMOVE any /process suffix if it exists
        if (fullUrl.endsWith('/process')) {
          fullUrl = fullUrl.substring(0, fullUrl.length - 8); // Remove "/process" 
          debugLog("FORWARDING", `Removing "/process" suffix: ${url} -> ${fullUrl}`);
        }
        
        // Make sure logs are created in receiving gears by using create_log=true
        // If URL already has parameters that would disable logging, update them
        if (fullUrl.includes('no_log=true')) {
          // Replace no_log=true with create_log=true
          fullUrl = fullUrl.replace('no_log=true', 'create_log=true');
          debugLog("FORWARDING", `Fixed URL to enable logs: ${fullUrl}`);
        } else if (fullUrl.includes('create_log=false')) {
          // Replace create_log=false with create_log=true
          fullUrl = fullUrl.replace('create_log=false', 'create_log=true');
          debugLog("FORWARDING", `Fixed URL to enable logs: ${fullUrl}`);
        }
        
        debugLog("FORWARDING", `Gear ${this.id} forwarding to URL: ${fullUrl}`);
        
        // Edge Runtime requires absolute URLs for fetch
        if (fullUrl.startsWith('/')) {
          // For browser context, use window.location
          if (typeof window !== 'undefined') {
            fullUrl = `${window.location.origin}${fullUrl}`;
            debugLog("FORWARDING", `Client-side URL: ${fullUrl}`);
          } else {
            // In server context (edge runtime) we must use absolute URLs
            // Try to get from env vars first, fallback to localhost for development
            const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3333';
            fullUrl = `${baseURL}${fullUrl}`;
            debugLog("FORWARDING", `Server-side absolute URL: ${fullUrl}`);
          }
        }
        
        try {
          // Only critical logs in production, details in debug mode
          debugLog("FORWARDING", `Sending request to ${fullUrl}`);
          
          // Each gear is the source for its own forwarded messages
          const response = await fetch(fullUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source_gear: {
                id: this.id,
                label: this.label
              },
              message_id: newMessageId,
              data: output,
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error response from ${fullUrl}: ${response.status} ${errorText}`);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
          } else {
            debugLog("FORWARDING", `Successfully forwarded from ${this.id} to ${fullUrl}`);
          }
        } catch (fetchError) {
          // Log the detailed error for debugging
          console.error(`Fetch error for ${fullUrl}:`, fetchError);
          
          // Fall back to log the error and continue with other URLs
          debugLog("FORWARDING", `Will continue with other URLs despite error`);
        }
      } catch (error) {
        console.error(`Error forwarding from ${this.id} to ${url}:`, error);
      }
    }
  }
}
