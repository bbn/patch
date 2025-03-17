// Import unified database interface
import { getDatabase, Database } from '../../database';
import { doc, onSnapshot } from 'firebase/firestore';
import { db as firestoreDb } from '../../firebase';

// Get the appropriate database implementation based on environment
const database: Database = getDatabase();

import { GearChat } from "../GearChat";
import { Message, Role, GearInput, GearOutput } from "../types";
import { debugLog, isDebugLoggingEnabled } from "../../utils";
import { GearData, ExampleInput, GearLogEntry } from "./types";
import { processWithLLM, processWithSpecialPrompt } from "./processing";
import { addExampleInput as addExampleInputFn, updateExampleInput, deleteExampleInput, processExampleInput as processExampleInputFn } from "./examples";
import { logInfo, logError, logWarning, logDebug } from "../../logger";

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
    // Add diagnostic logging to understand what methods are available
    logDebug("Gear", "Constructor called, available methods:", 
      Object.getOwnPropertyNames(Object.getPrototypeOf(this)));
    
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
    // This method requires different behavior on client and server
    if (typeof window !== 'undefined') {
      // Client-side: Use the API endpoint for proper cleanup
      try {
        const response = await fetch(`/api/gears/${id}`, {
          method: 'DELETE',
        });
        
        return response.ok;
      } catch (error) {
        logError("Gear", `Error deleting gear ${id}:`, error);
        return false;
      }
    } else {
      // Server-side: Use our database abstraction
      return await database.deleteGear(id);
    }
  }

  static async findById(id: string): Promise<Gear | null> {
    try {
      const gearData = await database.getGear<GearData>(id);
      
      if (gearData) {
        return new Gear(gearData);
      }
      return null;
    } catch (error) {
      logError("Gear", `Error fetching gear ${id}:`, error);
      return null;
    }
  }

  static async findAll(): Promise<Gear[]> {
    try {
      const gearsData = await database.getAllGears();
      return gearsData.map(gearData => new Gear(gearData as GearData));
    } catch (error) {
      logError("Gear", "Error fetching all gears:", error);
      return [];
    }
  }

  // Subscribe to real-time updates for a gear
  // This should be called on client-side only
  subscribeToUpdates(callback: (gear: Gear) => void): () => void {
    if (typeof window === 'undefined') {
      logWarning("Gear", 'subscribeToUpdates should only be called on the client side');
      return () => {};
    }

    // Unsubscribe from any existing subscription
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    // Create a new subscription
    const docRef = doc(firestoreDb, 'gears', this._data.id);
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
      logError("Gear", `Error in real-time updates for gear ${this._data.id}:`, error);
    });

    // Return the unsubscribe function
    return () => {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
    };
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
      logError("Gear", "Cannot save gear: data or id is missing");
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
    logInfo("Gear", `Saving gear ${this._data.id}`);
    
    // Use conditional debug logging for verbose output
    debugLog("GEAR-SAVE", `Saving gear ${this._data.id} with ${this._data.log?.length || 0} log entries`);
    
    // Debug log when saving with a label (only in debug mode)
    if (this._data.label) {
      debugLog("LABEL", `save() called with label = "${this._data.label}"`);
    }
    
    try {
      // Skip direct Firestore save if we're in a server API handler to avoid redundant saves
      if (typeof window !== 'undefined' && this.inServerApiHandler) {
        logInfo("Gear", `Skipping direct save of gear ${this._data.id} (in server API handler)`);
        return;
      }
      
      // Make a clean copy of the data to ensure it's a plain object
      const cleanData = JSON.parse(JSON.stringify(this._data));
      
      // Ensure the log array is defined (never undefined/null)
      if (!cleanData.log) {
        cleanData.log = [];
        logInfo("Gear", `Ensuring log array exists for gear ${this._data.id}`);
      }
      
      // Save using our unified database interface
      await database.saveGear(this._data.id, cleanData);
      
      debugLog("LABEL", `Successfully saved gear with label = "${this._data.label || 'none'}"`);
    } catch (error) {
      logError("Gear", `Error saving gear ${this._data.id}:`, error);
      throw error; // Rethrow to ensure errors are properly propagated
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
  
  async setMessages(messages: Message[], skipSave = false) {
    this._data.messages = messages;
    // Make sure the chat instance uses the updated messages
    this.chat = new GearChat(this._data.messages, this._data.id);
    if (!skipSave) {
      await this.save();
    }
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
  
  // Add a setter for inputs
  async setInputs(inputs: Record<string, GearInput>, skipSave = false) {
    this._data.inputs = inputs;
    if (!skipSave) {
      await this.save();
    }
  }
  
  get output() {
    return this._data.output;
  }

  get exampleInputs() {
    return this._data.exampleInputs || [];
  }

  async setExampleInputs(examples: ExampleInput[], skipSave = false) {
    console.log(`Setting ${examples.length} examples for gear ${this.id}`);
    
    // Log examples with output for debugging
    const withOutput = examples.filter(ex => ex.output !== undefined);
    console.log(`Examples with output: ${withOutput.length}`);
    
    if (withOutput.length > 0) {
      const example = withOutput[0];
      console.log(`Example with output: ${example.id}`);
      console.log(`Output type: ${typeof example.output}`);
      console.log(`Has lastProcessed: ${!!example.lastProcessed}`);
    }
    
    this._data.exampleInputs = examples;
    
    if (!skipSave) {
      await this.save();
      console.log(`Saved gear after setting examples`);
    }
  }

  get label() {
    return this._data.label || `Gear ${this._data.id.slice(0, 8)}`;
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
      await this.updateContainingPatchDescriptions();
    }
  }
  
  get log() {
    return this._data.log || [];
  }

  // Explicitly define the method on the prototype to ensure it's always available
  clearLog = async () => {
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
    
    // Explicitly create log array if it doesn't exist
    if (!this._data.log) {
      this._data.log = [];
    }
    
    // Important: Replace the entire array rather than just assigning to maintain references
    // This ensures the array is properly updated and saved to Firestore
    this._data.log.length = 0; // Clear the array while preserving the reference
    
    // Add each entry to the array
    for (const entry of logEntries) {
      this._data.log.push(entry);
    }
    
    console.log(`Log array now has ${this._data.log.length} entries`);
    
    if (!skipSave) {
      await this.save();
    }
  }

  // Process methods
  async process(input?: GearInput) {
    try {
      let output;
      
      // Add more detailed logging
      console.log(`Process called for gear ${this.id}`);
      console.log(`Input type: ${input !== undefined ? typeof input : 'undefined (using all inputs)'}`);
      
      if (input !== undefined) {
        // For backward compatibility, if input is provided directly,
        // process just that input directly
        console.log(`Processing single input for gear ${this.id}`);
        output = await processWithLLM(this, input);
        
        console.log(`Received output from LLM for gear ${this.id}:`);
        console.log(`Output type: ${typeof output}`);
        if (typeof output === 'string') {
          console.log(`Output preview: ${output.substring(0, 50)}...`);
        } else if (output) {
          console.log(`Output preview: ${JSON.stringify(output).substring(0, 50)}...`);
        }
        
        this._data.output = output;
        await this.save();
        
        console.log(`Saved gear with new output`);
        return output;
      }
      
      // Process all inputs from the inputs dictionary
      console.log(`Processing all inputs for gear ${this.id}`);
      output = await processWithLLM(this);
      
      console.log(`Received output from LLM for gear ${this.id}:`);
      console.log(`Output type: ${typeof output}`);
      if (typeof output === 'string') {
        console.log(`Output preview: ${output.substring(0, 50)}...`);
      } else if (output) {
        console.log(`Output preview: ${JSON.stringify(output).substring(0, 50)}...`);
      }
      
      this._data.output = output;
      await this.save();
      
      console.log(`Saved gear with new output`);
      return output;
    } catch (error) {
      console.error(`Error processing: ${error}`);
      throw error;
    }
  }

  // Helper methods
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

  async processWithoutLogging(source: string, input: GearInput): Promise<GearOutput> {
    // Store the input in inputs dictionary
    if (!this._data.inputs) {
      this._data.inputs = {};
    }
    this._data.inputs[source] = input;
    this._data.updatedAt = Date.now();
    await this.save();
    
    // Process the input using LLM
    const output = await processWithLLM(this, input);
    
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
  
  async setOutputUrls(urls: string[], skipSave = false) {
    this._data.outputUrls = urls;
    if (!skipSave) {
      await this.save();
    }
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
      
      // Save to persistent storage
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

  async processAllExamples(): Promise<ExampleInput[]> {
    if (!this._data.exampleInputs || this._data.exampleInputs.length === 0) {
      return [];
    }
    
    console.log(`Processing all ${this._data.exampleInputs.length} examples for gear ${this.id}`);
    const results: ExampleInput[] = [];
    
    // Process examples one by one
    for (const example of this._data.exampleInputs) {
      try {
        console.log(`Processing example ${example.id}`);
        // We'll need to implement the actual process example logic directly here
        // or import it from examples.ts
        const processedExample = await this.processExampleInput(example.id);
        if (processedExample) {
          results.push(processedExample);
        }
      } catch (error) {
        console.error(`Error processing example input ${example.id}:`, error);
        // Continue processing other examples even if one fails
      }
    }
    
    // Verify all examples were processed
    console.log(`Processed ${results.length} examples successfully`);
    const examplesWithOutput = this._data.exampleInputs.filter(ex => ex.output !== undefined);
    console.log(`Examples with output after processing: ${examplesWithOutput.length}/${this._data.exampleInputs.length}`);
    
    // Final save to ensure all examples are persisted
    await this.save();
    
    return results;
  }

  // Add method to gear instance that delegates to the imported function
  addExampleInput = async (name: string, input: GearInput): Promise<ExampleInput> => {
    console.log(`Gear instance method addExampleInput called for gear ${this.id}`);
    return addExampleInputFn(this, name, input);
  }
  
  // Add update method to gear instance
  updateExampleInput = async (id: string, updates: Partial<ExampleInput>): Promise<ExampleInput | null> => {
    return updateExampleInput(this, id, updates);
  }
  
  // Add delete method to gear instance
  deleteExampleInput = async (id: string): Promise<boolean> => {
    return deleteExampleInput(this, id);
  }
  
  // Process example input using the imported function
  processExampleInput = async (id: string): Promise<ExampleInput | null> => {
    console.log(`Processing example ${id} for gear ${this.id}`);
    return processExampleInputFn(this, id);
  }
  
  async forwardOutputToGears(output: GearOutput): Promise<void> {
    // Debug log the output type and structure to help diagnose issues
    console.log(`forwardOutputToGears called for gear ${this.id} with output type ${typeof output}`);
    if (typeof output === 'string') {
      console.log(`Output preview: ${output.substring(0, 50)}...`);
    } else if (output) {
      console.log(`Output preview: ${JSON.stringify(output).substring(0, 50)}...`);
    }
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
        
        // Always ensure logs are created in receiving gears when forwarding outputs (including example outputs)
        // This is important because we want to see logs in gear B when we send output from gear A to B
        if (this._data.inputs && this._data.inputs['example_output']) {
          console.log(`Example output from gear ${this.id}, ENABLING logs in target gears`);
          const inputPreview = typeof this._data.inputs['example_output'] === 'string' 
            ? this._data.inputs['example_output'].substring(0, 40) 
            : JSON.stringify(this._data.inputs['example_output']).substring(0, 40);
          debugLog("FORWARDING", `Example output inputs key exists: ${inputPreview}...`);
        }
        
        // For all forwarding, ensure logs are created
        if (fullUrl.includes('no_log=true')) {
          // Replace no_log=true with create_log=true
          fullUrl = fullUrl.replace('no_log=true', 'create_log=true');
          debugLog("FORWARDING", `Fixed URL to enable logs: ${fullUrl}`);
        } else if (fullUrl.includes('create_log=false')) {
          // Replace create_log=false with create_log=true
          fullUrl = fullUrl.replace('create_log=false', 'create_log=true');
          debugLog("FORWARDING", `Fixed URL to enable logs: ${fullUrl}`);
        } else if (!fullUrl.includes('create_log=true')) {
          // Add parameter to enable log creation if not already there
          fullUrl += (fullUrl.includes('?') ? '&' : '?') + 'create_log=true';
          debugLog("FORWARDING", `Adding parameter to enable logs: ${fullUrl}`);
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
      const response = await processWithSpecialPrompt(this, prompt);
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
}