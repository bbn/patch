// Import client-side operations
import { saveGear, getGear, deleteGear, getAllGears } from '../firestore';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';

// Import server-side operations for Node.js environment
// Using dynamic import to avoid bundling firebase-admin code in client components
let saveGearAdmin: (id: string, data: any) => Promise<void>;
let getGearAdmin: <T>(id: string) => Promise<T | null>;
let deleteGearAdmin: (id: string) => Promise<boolean>;
let getAllGearsAdmin: () => Promise<any[]>;

// Only import server functions if running on the server
if (typeof window === 'undefined') {
  // Using require instead of import to avoid bundling issues
  const serverFunctions = require('../server/firestore-admin');
  saveGearAdmin = serverFunctions.saveGearAdmin;
  getGearAdmin = serverFunctions.getGearAdmin;
  deleteGearAdmin = serverFunctions.deleteGearAdmin;
  getAllGearsAdmin = serverFunctions.getAllGearsAdmin;
}

import { GearChat } from "./GearChat";
import { Message, Role, GearInput, GearOutput } from "./types";
import { debugLog, isDebugLoggingEnabled } from "../utils";

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
  patchId?: string; // The ID of the patch this gear belongs to
  nodeId?: string;  // The ID of the node in the patch this gear corresponds to
  position?: { x: number; y: number }; // Position in the ReactFlow canvas
}

export class Gear {
  // Changed to protected to allow access from subclasses but not directly from outside
  protected _data: GearData;
  private chat: GearChat;
  private unsubscribe: (() => void) | null = null;
  
  // Add a getter for data to access it safely
  get data(): GearData {
    return { ...this._data };
  }
  
  // Flag to control whether patch descriptions should be updated
  // Set to true during initial creation to prevent unnecessary updates
  skipDescriptionUpdates = false;
  
  // Flag to collect multiple updates before saving to reduce API calls
  private batchUpdates = false;
  pendingChanges = false;

  constructor(data: Partial<GearData> & { id: string }) {
    this._data = {
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
      patchId: data.patchId,
      nodeId: data.nodeId,
      position: data.position,
    };
    this.chat = new GearChat(this._data.messages, this._data.id);
  }

  static async create(data: Partial<GearData> & { id: string }): Promise<Gear> {
    const gear = new Gear(data);
    
    // Skip description updates during initial creation
    gear.skipDescriptionUpdates = true;
    
    // For initial creation, no need to batch since we need to save immediately
    if (!data.messages || data.messages.length === 0) {
      gear.data.messages = [
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: 'You are a Gear that processes inputs and produces outputs. You can be configured with instructions.'
        }
      ];
    }
    
    // Directly save the gear to ensure it's written to the database
    await gear.save();
    
    // Re-enable description updates after initial save
    gear.skipDescriptionUpdates = false;
    
    return gear;
  }
  
  static async deleteById(id: string): Promise<boolean> {
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint
      try {
        const response = await fetch(`/api/gears/${id}`, {
          method: 'DELETE',
        });
        
        return response.ok;
      } catch (error) {
        console.error(`Error deleting gear ${id}:`, error);
        return false;
      }
    } else {
      // Server-side: Use Firebase Admin SDK
      const deleted = await deleteGearAdmin(id);
      
      if (deleted) {
        console.log(`Deleted gear ${id} from Firestore (server-side)`);
      }
      
      return deleted;
    }
  }

  static async findById(id: string): Promise<Gear | null> {
    if (typeof window !== 'undefined') {
      // Client-side: Use direct Firestore instead of API
      try {
        console.log(`Retrieving gear ${id} directly from Firestore`);
        const gearData = await getGear<GearData>(id);
        
        if (gearData) {
          console.log(`Found gear ${id} in Firestore`);
          return new Gear(gearData);
        }
        return null;
      } catch (error) {
        console.error(`Error fetching gear ${id} from Firestore:`, error);
        return null;
      }
    } else {
      // Server-side: Use Firebase Admin SDK
      const gearData = await getGearAdmin<GearData>(id);
      
      if (gearData) {
        console.log(`Found gear ${id} in Firestore`);
        return new Gear(gearData);
      }
      
      // Return null if gear not found
      return null;
    }
  }

  // Subscribe to real-time updates for a gear
  // This should be called on client-side only
  subscribeToUpdates(callback: (gear: Gear) => void): () => void {
    if (typeof window === 'undefined') {
      console.warn('subscribeToUpdates should only be called on the client side');
      return () => {};
    }

    // Unsubscribe from any existing subscription
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    // Create a new subscription
    const docRef = doc(db, 'gears', this._data.id);
    this.unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const updatedData = docSnap.data() as GearData;
        // Update the internal data
        this._data = updatedData;
        // Recreate chat instance with updated messages
        this.chat = new GearChat(this._data.messages, this._data.id);
        // Notify the callback
        callback(this);
      }
    }, (error) => {
      console.error(`Error in real-time updates for gear ${this._data.id}:`, error);
    });

    // Return the unsubscribe function
    return () => {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
    };
  }
  
  // Get all gears from the store
  static async findAll(): Promise<Gear[]> {
    if (typeof window !== 'undefined') {
      // Client-side: Use direct Firestore instead of API
      try {
        console.log('Retrieving all gears directly from Firestore');
        const gearDataList = await getAllGears();
        return gearDataList.map((gearData) => {
          // Ensure the data has the required properties for GearData
          return new Gear({
            id: gearData.id as string,
            ...(gearData as Partial<GearData>)
          });
        });
      } catch (error) {
        console.error("Error fetching gears from Firestore:", error);
        return [];
      }
    } else {
      // Server-side: Use Firestore directly
      const gears: Gear[] = [];
      
      // Get all gears from Firestore using Admin SDK
      const gearDataList = await getAllGearsAdmin();
      
      for (const gearData of gearDataList) {
        // Ensure the data has the required properties for GearData
        gears.push(new Gear({
          id: gearData.id as string,
          ...(gearData as Partial<GearData>)
        }));
      }
      
      return gears;
    }
  }

  // Subscribe to real-time updates for all gears
  // This should be called on client-side only
  static subscribeToAll(callback: (gears: Gear[]) => void): () => void {
    if (typeof window === 'undefined') {
      console.warn('subscribeToAll should only be called on the client side');
      return () => {};
    }

    // Create a new subscription to the gears collection
    const gearsRef = collection(db, 'gears');
    const unsubscribe = onSnapshot(gearsRef, (querySnapshot) => {
      const gears: Gear[] = [];
      querySnapshot.forEach((doc) => {
        gears.push(new Gear(doc.data() as GearData));
      });
      callback(gears);
    }, (error) => {
      console.error('Error in real-time updates for all gears:', error);
    });

    // Return the unsubscribe function
    return unsubscribe;
  }

  // Flag to track if we're currently in a server-side API handler
  // This helps prevent redundant API calls when already in an API route 
  private inServerApiHandler = false;
  
  /**
   * Mark that this instance is being used within a server API handler
   * When true, client-side API calls will be skipped to avoid duplicate saves
   */
  markAsServerApiHandler() {
    this.inServerApiHandler = true;
  }
  
  /**
   * Start collecting updates without saving after each change
   * This allows batching multiple property updates into a single save operation
   */
  startBatchUpdate() {
    this.batchUpdates = true;
    this.pendingChanges = false;
  }
  
  /**
   * Complete a batch update by saving all collected changes at once
   */
  async completeBatchUpdate(forceSave = false): Promise<void> {
    this.batchUpdates = false;
    // Save if we have pending changes or if forceSave is true
    if (this.pendingChanges || forceSave) {
      await this.save();
    }
    this.pendingChanges = false;
  }
  
  async save(): Promise<void> {
    // Ensure data is not null and has required fields
    if (!this._data || !this._data.id) {
      console.error("Cannot save gear: data or id is missing");
      throw new Error("Cannot save gear: data or id is missing");
    }
    
    // If we're in batch update mode, just mark that we have pending changes
    // and don't actually save yet
    if (this.batchUpdates) {
      this.pendingChanges = true;
      debugLog("GEAR-SAVE", `Deferring save of gear ${this._data.id} (batch mode)`);
      return;
    }
    
    this._data.updatedAt = Date.now();
    
    // Keep only critical logs for production, use debug logging for verbose output
    console.log(`Saving gear ${this._data.id}`);
    
    // Use conditional debug logging for verbose output
    debugLog("GEAR-SAVE", `Saving gear ${this._data.id} with ${this._data.log?.length || 0} log entries`);
    
    // Debug log when saving with a label (only in debug mode)
    if (this._data.label) {
      debugLog("LABEL", `save() called with label = "${this._data.label}"`);
    }
    
    if (typeof window !== 'undefined' && !this.inServerApiHandler) {
      // Client-side: Use direct Firestore instead of API
      // Skip if we're already inside a server API handler to avoid redundant saves
      try {
        console.log(`Saving gear ${this._data.id} directly to Firestore`);
        
        // Make a clean copy of the data to ensure it's a plain object
        const cleanData = JSON.parse(JSON.stringify(this._data));
        
        // Save directly to Firestore using client SDK
        await saveGear(this._data.id, cleanData);
        
        debugLog("LABEL", `Successfully saved gear directly to Firestore with label = "${this._data.label || 'none'}"`);
      } catch (error) {
        console.error(`Error saving gear ${this._data.id} to Firestore:`, error);
      }
    } else {
      // Server-side: Use Firestore directly
      try {
        console.log(`Saving gear ${this._data.id} to Firestore (server-side)`);
        
        // Make a clean copy of the data to ensure it's a plain object
        const cleanData = JSON.parse(JSON.stringify(this._data));
        
        // Save to Firestore using the Admin SDK
        await saveGearAdmin(this._data.id, cleanData);
        
        console.log(`Successfully saved gear ${this._data.id} to Firestore (server-side)`);
      } catch (error) {
        console.error(`Error saving to Firestore:`, error);
        throw error; // Rethrow to ensure errors are properly propagated
      }
    }
  }

  // Getters
  get id() {
    return this._data.id;
  }
  get outputUrls() {
    return this._data.outputUrls;
  }
  get messages() {
    return this._data.messages;
  }
  get createdAt() {
    return this._data.createdAt;
  }
  get updatedAt() {
    return this._data.updatedAt;
  }

  get inputs() {
    return this._data.inputs || {};
  }

  get output() {
    return this._data.output;
  }

  get exampleInputs() {
    return this._data.exampleInputs || [];
  }

  get label() {
    return this._data.label || `Gear ${this._data.id.slice(0, 8)}`;
  }
  
  get log() {
    return this._data.log || [];
  }

  async clearLog() {
    console.log(`Clearing log for gear ${this.id}`);
    this._data.log = [];
    
    // Debug log for verification
    debugLog("LOG", `Log array length after clearing: ${this._data.log.length}`);
    
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
  
  async setLog(logEntries: GearLogEntry[], skipSave = false) {
    console.log(`Setting log for gear ${this.id} with ${logEntries.length} entries`);
    this._data.log = logEntries;
    if (!skipSave) {
      await this.save();
    }
  }

  async setLabel(label: string, skipPatchUpdates = false) {
    console.log(`Setting label for gear ${this.id}: "${label}"`);
    debugLog("LABEL", `setLabel called with label: "${label}" (length: ${label.length}, type: ${typeof label})`);
    
    // Skip updates if label hasn't actually changed
    if (this._data.label === label) {
      debugLog("LABEL", `Label unchanged, skipping update`);
      return;
    }
    
    this._data.label = label;
    await this.save();
    debugLog("LABEL", `setLabel completed, current label: "${this._data.label}"`);
    
    // Only update patch descriptions for meaningful label changes
    if (!label.startsWith("Gear ") && !this.skipDescriptionUpdates && !skipPatchUpdates) {
      await this.updatePatchDescriptions();
    }
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
  async setMessages(messages: Message[], skipPatchUpdates = false) {
    this._data.messages = messages;
    await this.save();
    
    // Updates to messages can change gear functionality, but we may want to batch updates
    if (!skipPatchUpdates && !this.skipDescriptionUpdates) {
      await this.updateContainingPatchDescriptions();
    }
  }
  
  async setOutputUrls(urls: string[], skipSave = false) {
    this._data.outputUrls = urls;
    if (!skipSave) {
      await this.save();
    }
  }
  
  async setExampleInputs(examples: ExampleInput[], skipSave = false) {
    this._data.exampleInputs = examples;
    if (!skipSave) {
      await this.save();
    }
  }

  async addExampleInput(name: string, input: GearInput): Promise<ExampleInput> {
    if (!this._data.exampleInputs) {
      this._data.exampleInputs = [];
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
    
    this._data.exampleInputs.push(example);
    await this.save();
    
    // Sync with server
    if (typeof window !== 'undefined') {
      try {
        const updateResponse = await fetch(`/api/gears/${this._data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exampleInputs: this._data.exampleInputs
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
    if (!this._data.exampleInputs) {
      return null;
    }
    
    const index = this._data.exampleInputs.findIndex(example => example.id === id);
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
    
    this._data.exampleInputs[index] = {
      ...this._data.exampleInputs[index],
      ...updates
    };
    
    await this.save();
    
    // Sync with server
    if (typeof window !== 'undefined') {
      try {
        const updateResponse = await fetch(`/api/gears/${this._data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exampleInputs: this._data.exampleInputs
          }),
        });
        
        if (!updateResponse.ok) {
          console.warn("Failed to update example inputs on server:", await updateResponse.text());
        }
      } catch (err) {
        console.warn("Error updating example inputs on server:", err);
      }
    }
    
    return this._data.exampleInputs[index];
  }

  async deleteExampleInput(id: string): Promise<boolean> {
    if (!this._data.exampleInputs) {
      return false;
    }
    
    const initialLength = this._data.exampleInputs.length;
    this._data.exampleInputs = this._data.exampleInputs.filter(example => example.id !== id);
    
    if (this._data.exampleInputs.length !== initialLength) {
      await this.save();
      
      // Sync with server
      if (typeof window !== 'undefined') {
        try {
          const updateResponse = await fetch(`/api/gears/${this._data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              exampleInputs: this._data.exampleInputs
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
    if (!this._data.exampleInputs) {
      return null;
    }
    
    const example = this._data.exampleInputs.find(ex => ex.id === id);
    if (!example) {
      return null;
    }
    
    try {
      // For examples, directly process with the API using forward=false and create_log=false
      // to prevent both forwarding outputs and creating log entries when processing examples
      if (typeof window !== 'undefined') {
        // In browser, use the API with forward=false and create_log=false
        try {
          const response = await fetch(`/api/gears/${this._data.id}?forward=false&create_log=false`, {
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
          const updateResponse = await fetch(`/api/gears/${this._data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              exampleInputs: this._data.exampleInputs
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
    if (!this._data.exampleInputs || this._data.exampleInputs.length === 0) {
      return [];
    }
    
    const results: ExampleInput[] = [];
    
    for (const example of this._data.exampleInputs) {
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
    console.log(`Gear.addMessage: Adding ${role} message to gear ${this._data.id}`);
    
    try {
      // Add message to chat object
      await this.chat.addMessage({ role, content });
      console.log(`Gear.addMessage: Message added to chat, saving to data store`);
      
      // Note: we don't need to push to data.messages since the GearChat maintains the same reference
      // But let's log what we're going to save
      console.log(`Gear.addMessage: Current messages array length: ${this._data.messages.length}`);
      console.log(`Gear.addMessage: Last message role: ${this._data.messages[this._data.messages.length-1]?.role || 'none'}`);
      
      // Save to persistent storage - this will now intelligently handle server-side vs client-side
      // The updated save() method will skip client-side API calls if inServerApiHandler is true
      try {
        await this.save();
        console.log(`Gear.addMessage: Successfully saved gear data with new message`);
      } catch (saveError) {
        console.error(`Gear.addMessage: Error saving gear after adding message:`, saveError);
        throw saveError;
      }
    } catch (error) {
      console.error(`Gear.addMessage: Unexpected error adding message:`, error);
      throw error;
    }

    // Generate a new label if this completes a message exchange (user then assistant)
    if (role === 'assistant' && this._data.messages.length >= 2) {
      debugLog("LABEL", `Detected assistant message following other messages`);
      const previousMessage = this._data.messages[this._data.messages.length - 2];
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
          debugLog("LABEL", `After label generation, gear label = "${this._data.label}"`);
          
          // Get the saved gear to make sure the label was persisted
          if (typeof window !== 'undefined') {
            try {
              const checkResponse = await fetch(`/api/gears/${this._data.id}`);
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
    if ((role === "system" || role === "user") && this._data.exampleInputs && this._data.exampleInputs.length > 0) {
      // Process all examples with the updated instructions
      await this.processAllExamples();
    }
  }
  
  async generateLabel(): Promise<string> {
    try {
      console.log(`Generating label for gear ${this.id}`);
      debugLog("LABEL", `Current messages for label generation:`, this._data.messages);
      
      // Generate a concise label based on the gear's messages
      const prompt = `Based on this conversation, generate a concise 1-3 word label that describes what transformation this gear performs. The label should be short and descriptive like "french translator" or "slack conversation summarizer". Only respond with the label text, nothing else.

Example conversations and labels:
- Conversation about translating text to French → "French Translator"
- Conversation about summarizing Slack messages → "Slack Summarizer"
- Conversation about extracting key information from emails → "Email Extractor"

Here is the conversation:
${this._data.messages.map(m => `${m.role}: ${m.content}`).join('\n')}
`;

      debugLog("LABEL", `Sending prompt for label generation: ${prompt.substring(0, 200)}...`);
      
      // Use the LLM to generate a label
      const response = await this.processWithSpecialPrompt(prompt);
      debugLog("LABEL", `Got raw response for label: ${response}`);
      
      // Clean the response if needed (remove quotes, etc.)
      let cleanedLabel;
      
      // Normal response - just clean and trim
      cleanedLabel = response.replace(/^["']|["']$/g, '').trim();
      debugLog("LABEL", `Response cleaning: ${cleanedLabel}`);
      
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
      this._data.label = cleanedLabel;
      debugLog("LABEL", `Set gear.data.label = "${this._data.label}"`);
      
      await this.save();
      debugLog("LABEL", `Saved gear with new label "${this._data.label}"`);
      
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
        
        // Regular JSON response
        try {
          const text = await response.text();
          console.log("Raw response:", text.substring(0, 100) + "...");
          
          try {
            const result = JSON.parse(text);
            return result.text || result.content || result.response || text;
          } catch (jsonError) {
            console.warn("Failed to parse JSON response, using raw text:", jsonError);
            return text; // Use raw text if JSON parsing fails
          }
        } catch (textError) {
          console.error("Error getting response text:", textError);
          return "Error reading response";
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
  async updateContainingPatchDescriptions(specificPatchId?: string): Promise<void> {
    // Skip this entirely on initial creation or when running server-side
    if (typeof window === 'undefined' || this.skipDescriptionUpdates) {
      return;
    }

    try {
      // If a specific patch ID is provided, only update that one
      if (specificPatchId) {
        console.log(`Updating description for specific patch ${specificPatchId}`);
        await fetch(`/api/patches/${specificPatchId}/description`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        return;
      }
      
      // Use a single request to get all patches in a compact format
      const response = await fetch('/api/patches');
      if (!response.ok) return;
      
      const patches = await response.json();
      
      // Find patches containing this gear by ID more efficiently
      const batchPromises: Promise<void>[] = [];
      const patchesToUpdate: string[] = [];
      
      for (const patchData of patches) {
        batchPromises.push(
          (async () => {
            try {
              const patchResponse = await fetch(`/api/patches/${patchData.id}`);
              if (!patchResponse.ok) return;
              
              const fullPatchData = await patchResponse.json();
              
              // Check if any nodes in this patch use this gear
              const containsThisGear = fullPatchData.nodes?.some(
                (node: any) => node.data?.gearId === this.id
              );
              
              if (containsThisGear) {
                patchesToUpdate.push(patchData.id);
              }
            } catch (error) {
              console.error(`Error checking patch ${patchData.id} for gear:`, error);
            }
          })()
        );
      }
      
      // Wait for all checks to complete
      await Promise.all(batchPromises);
      
      // Now update descriptions in batch
      if (patchesToUpdate.length > 0) {
        console.log(`Updating descriptions for ${patchesToUpdate.length} patches containing gear ${this.id}`);
        
        // Update descriptions in parallel
        await Promise.all(
          patchesToUpdate.map(patchId => 
            fetch(`/api/patches/${patchId}/description`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            })
          )
        );
      }
    } catch (error) {
      console.error("Error updating patch descriptions after gear changes:", error);
    }
  }

  async processWithoutLogging(source: string, input: GearInput): Promise<GearOutput> {
    // Store the input in inputs dictionary
    if (!this._data.inputs) {
      this._data.inputs = {};
    }
    this._data.inputs[source] = input;
    this._data.updatedAt = Date.now();
    await this.save();
    
    // Process the input using LLM
    const output = await this.processWithLLM(input);
    
    // Store the output
    this._data.output = output;
    await this.save();
    
    return output;
  }
  
  // Keep for backward compatibility but modify to use processWithoutLogging
  async processInput(source: string, input: GearInput, sourceLabel?: string): Promise<GearOutput> {
    console.log("WARNING: processInput is deprecated, use processWithoutLogging instead");
    return this.processWithoutLogging(source, input);
  }

  async addOutputUrl(url: string, skipSave = false) {
    // Check if URL already exists to avoid unnecessary updates
    const urlExists = this._data.outputUrls.includes(url);
    if (!urlExists) {
      console.log(`Adding URL ${url} to gear ${this.id}`);
      this._data.outputUrls.push(url);
      if (!skipSave) {
        await this.save();
      }
    }
    
    return !urlExists; // Return true if we added the URL
  }

  async removeOutputUrl(url: string, skipSave = false) {
    // Check if URL actually exists to avoid unnecessary updates
    const initialLength = this._data.outputUrls.length;
    this._data.outputUrls = this._data.outputUrls.filter((u) => u !== url);
    
    // Only save if there was an actual change
    if (initialLength !== this._data.outputUrls.length && !skipSave) {
      console.log(`Removed URL ${url} from gear ${this.id}`);
      await this.save();
    }
    
    return initialLength !== this._data.outputUrls.length;
  }

  systemPrompt(): string {
    const basePrompt = `You are interacting with a Gear in a distributed message processing system. A Gear is a modular component that processes messages and produces outputs that can be consumed by other Gears. The processing instructions are communicated to the gear via chat messages.

    Here are this Gear's instructional messages:
    ${JSON.stringify(this._data.messages, null, 2)}

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
    const allInputs = this._data.inputs || {};
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
        this._data.output = output;
        await this.save();
        return output;
      }
      
      // Process all inputs from the inputs dictionary
      output = await this.processWithLLM();
      this._data.output = output;
      await this.save();
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
        
        // Regular JSON response
        console.log("Got regular JSON response");
        
        try {
          const text = await response.text();
          console.log("Raw response:", text.substring(0, 100) + "...");
          
          try {
            const result = JSON.parse(text);
            
            if (!result.text && !result.content && !result.response) {
              console.warn("Received potentially empty content from LLM response");
              // Return the raw text if we can't find content or text fields
              return text;
            }
            
            return result.text || result.content || result.response || text;
          } catch (jsonError) {
            console.warn("Failed to parse JSON response, using raw text:", jsonError);
            return text; // Use raw text if JSON parsing fails
          }
        } catch (textError) {
          console.error("Error getting response text:", textError);
          return "Error reading response";
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