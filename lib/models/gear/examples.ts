import { Gear } from "./Gear";
import { GearInput, GearOutput } from "../types";
import { ExampleInput } from "./types";
import { processWithLLM } from "./processing";

/**
 * Add a new example input to a gear
 */
export async function addExampleInput(gear: Gear, name: string, input: GearInput): Promise<ExampleInput> {
  if (!gear.data.exampleInputs) {
    gear.data.exampleInputs = [];
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
  
  // Create example with a unique ID
  const exampleId = crypto.randomUUID();
  const example: ExampleInput = {
    id: exampleId,
    name,
    input: processedInput,
  };
  
  // Add to the array and save
  gear.data.exampleInputs.push(example);
  await gear.save();
  
  // Sync with server
  if (typeof window !== 'undefined') {
    try {
      const updateResponse = await fetch(`/api/gears/${gear.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exampleInputs: gear.data.exampleInputs
        }),
      });
      
      if (!updateResponse.ok) {
        console.warn("Failed to update example inputs on server:", await updateResponse.text());
      }
    } catch (err) {
      console.warn("Error updating example inputs on server:", err);
    }
  }
  
  // Return a copy of the created example to ensure it has all required properties
  return { ...example };
}

/**
 * Update an existing example input
 */
export async function updateExampleInput(gear: Gear, id: string, updates: Partial<ExampleInput>): Promise<ExampleInput | null> {
  if (!gear.data.exampleInputs) {
    return null;
  }
  
  const index = gear.data.exampleInputs.findIndex(example => example.id === id);
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
  
  gear.data.exampleInputs[index] = {
    ...gear.data.exampleInputs[index],
    ...updates
  };
  
  await gear.save();
  
  // Sync with server
  if (typeof window !== 'undefined') {
    try {
      const updateResponse = await fetch(`/api/gears/${gear.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exampleInputs: gear.data.exampleInputs
        }),
      });
      
      if (!updateResponse.ok) {
        console.warn("Failed to update example inputs on server:", await updateResponse.text());
      }
    } catch (err) {
      console.warn("Error updating example inputs on server:", err);
    }
  }
  
  return gear.data.exampleInputs[index];
}

/**
 * Delete an example input
 */
export async function deleteExampleInput(gear: Gear, id: string): Promise<boolean> {
  if (!gear.data.exampleInputs) {
    return false;
  }
  
  const initialLength = gear.data.exampleInputs.length;
  gear.data.exampleInputs = gear.data.exampleInputs.filter(example => example.id !== id);
  
  if (gear.data.exampleInputs.length !== initialLength) {
    await gear.save();
    
    // Sync with server
    if (typeof window !== 'undefined') {
      try {
        const updateResponse = await fetch(`/api/gears/${gear.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exampleInputs: gear.data.exampleInputs
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

/**
 * Process a specific example input
 */
export async function processExampleInput(gear: Gear, id: string): Promise<ExampleInput | null> {
  if (!gear.data.exampleInputs) {
    return null;
  }
  
  // Find the example by ID
  const index = gear.data.exampleInputs.findIndex(ex => ex.id === id);
  if (index === -1) {
    console.error(`Example ${id} not found in exampleInputs array`);
    return null;
  }
  
  // Get the example by reference for processing
  const example = gear.data.exampleInputs[index];
  console.log(`Processing example ${id} for gear ${gear.id}`);
  
  try {
    // Process the example directly using the processWithLLM method for consistency
    console.log(`Using direct processWithLLM method for example processing`);
    const rawOutput = await processWithLLM(gear, example.input);
    
    console.log(`Processed example raw output:`);
    console.log(`  Raw output type: ${typeof rawOutput}`);
    if (typeof rawOutput === 'string') {
      console.log(`  Raw output preview: ${rawOutput.substring(0, 100)}...`);
    } else if (rawOutput) {
      console.log(`  Raw output preview: ${JSON.stringify(rawOutput).substring(0, 100)}...`);
    }
    
    // Extract clean output from Vercel AI SDK format if needed
    let cleanOutput = rawOutput;
    
    // Helper function to clean any text content
    const cleanTextContent = (text: string): string => {
      // Start with the provided text
      let cleaned = text.trim();
      
      // Remove "Output:" or "Output: " prefix if present (case insensitive)
      const outputPrefixRegex = /^(?:output:?\s*)/i;
      if (outputPrefixRegex.test(cleaned)) {
        console.log(`Removing "Output:" prefix from content`);
        cleaned = cleaned.replace(outputPrefixRegex, '');
      }
      
      // Remove surrounding quotes if present
      if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
          (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        console.log(`Removing surrounding quotes from content`);
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }
      
      return cleaned.trim();
    };
    
    // Handle the specific format we're seeing: [{"type":"text","text":"Output: \"text\""}]
    if (typeof rawOutput === 'string') {
      try {
        // Check if it's a JSON string containing a TextUIPart array
        if (rawOutput.startsWith('[{') && rawOutput.includes('"type":"text"')) {
          const parsed = JSON.parse(rawOutput);
          
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type === 'text') {
            console.log(`Detected Vercel AI SDK TextUIPart format, extracting content`);
            cleanOutput = cleanTextContent(parsed[0].text);
            console.log(`Extracted clean output: "${cleanOutput}"`);
          }
        } else {
          // It's a regular string, but still clean it
          cleanOutput = cleanTextContent(rawOutput);
          console.log(`Cleaned regular string output: "${cleanOutput}"`);
        }
      } catch (e) {
        console.warn(`Error parsing output format:`, e);
        // Still try to clean the raw output even if parsing fails
        cleanOutput = cleanTextContent(rawOutput);
      }
    } else if (typeof rawOutput === 'object' && rawOutput !== null) {
      // Handle object formats (like direct TextUIPart objects)
      try {
        if (Array.isArray(rawOutput) && rawOutput.length > 0 && 
            typeof rawOutput[0] === 'object' && rawOutput[0] !== null &&
            'type' in rawOutput[0] && rawOutput[0].type === 'text' && 
            'text' in rawOutput[0]) {
          
          // It's a TextUIPart array as an object
          console.log(`Detected TextUIPart array object format`);
          cleanOutput = cleanTextContent(rawOutput[0].text);
        } else if ('text' in rawOutput && typeof rawOutput.text === 'string') {
          // Simple object with text property
          console.log(`Detected object with text property`);
          cleanOutput = cleanTextContent(rawOutput.text);
        } else if ('content' in rawOutput && typeof rawOutput.content === 'string') {
          // Simple object with content property
          console.log(`Detected object with content property`);
          cleanOutput = cleanTextContent(rawOutput.content);
        }
      } catch (e) {
        console.warn(`Error processing object output:`, e);
        // Fall back to using the raw output
      }
    }
    
    // Update the example with the cleaned output using direct array modification
    gear.data.exampleInputs[index] = {
      ...example,
      output: cleanOutput,
      lastProcessed: Date.now()
    };
    
    // Log the updated example for verification
    console.log(`Updated example in array:`);
    console.log(`  ID: ${gear.data.exampleInputs[index].id}`);
    console.log(`  Has output: ${!!gear.data.exampleInputs[index].output}`);
    console.log(`  Output type: ${typeof gear.data.exampleInputs[index].output}`);
    
    // Save the updated example to Firestore
    await gear.save();
    console.log(`Saved gear with updated example`);
    
    // Extra verification step: Save again through the API to ensure consistency
    if (typeof window !== 'undefined') {
      try {
        console.log(`Explicitly syncing examples to server via API`);
        const updateResponse = await fetch(`/api/gears/${gear.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exampleInputs: gear.data.exampleInputs
          }),
        });
        
        if (!updateResponse.ok) {
          console.warn("Failed to update examples on server:", await updateResponse.text());
        } else {
          console.log(`Successfully synced examples to server`);
        }
      } catch (err) {
        console.warn("Error syncing examples to server:", err);
      }
    }
    
    // Return the updated example for client use
    return gear.data.exampleInputs[index];
  } catch (error) {
    console.error(`Error processing example input ${id}:`, error);
    throw error;
  }
}

/**
 * Process all examples for a gear
 */
export async function processAllExamples(gear: Gear): Promise<ExampleInput[]> {
  if (!gear.data.exampleInputs || gear.data.exampleInputs.length === 0) {
    return [];
  }
  
  console.log(`Processing all ${gear.data.exampleInputs.length} examples for gear ${gear.id}`);
  const results: ExampleInput[] = [];
  
  // Process examples one by one
  for (const example of gear.data.exampleInputs) {
    try {
      console.log(`Processing example ${example.id}`);
      const processedExample = await processExampleInput(gear, example.id);
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
  const examplesWithOutput = gear.data.exampleInputs.filter(ex => ex.output !== undefined);
  console.log(`Examples with output after processing: ${examplesWithOutput.length}/${gear.data.exampleInputs.length}`);
  
  // Final save to ensure all examples are persisted
  await gear.save();
  
  return results;
}