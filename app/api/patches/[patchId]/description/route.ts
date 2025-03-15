import { NextRequest } from 'next/server';
import { Patch } from "@/lib/models/Patch";
import { Gear } from "@/lib/models/Gear";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ patchId: string }> }
) {
  try {
    const resolvedParams = await params;
    console.log("Description API called for patchId:", resolvedParams.patchId);
    const patchId = resolvedParams.patchId;
    
    // Try to find the patch
    const patch = await Patch.findById(patchId);
    
    if (!patch) {
      console.log("Description API: Patch not found:", patchId);
      return new Response("Patch not found", { status: 404 });
    }
    
    console.log(`Description API: Found patch with ${patch.nodes.length} nodes and ${patch.edges.length} edges`);

    // Cache for gears to avoid loading same gear multiple times
    const gearCache = new Map();
    
    // Function to get gear from cache or load it
    const getGear = async (gearId) => {
      if (gearCache.has(gearId)) {
        return gearCache.get(gearId);
      }
      
      const gear = await Gear.findById(gearId);
      if (gear) {
        gearCache.set(gearId, gear);
      }
      return gear;
    };
    
    // Get unique gear IDs to avoid duplicates
    const uniqueGearIds = new Set(patch.nodes.map(node => node.data.gearId));
    console.log(`Loading ${uniqueGearIds.size} unique gears for description generation`);
    
    // Batch load all gears at once
    const gearPromises = Array.from(uniqueGearIds).map(gearId => getGear(gearId));
    const gears = await Promise.all(gearPromises);
    
    // Collect information about each gear's functionality (from its messages and label)
    const gearInfo = gears
      .filter(gear => gear !== null)
      .map(gear => {
        const messages = gear?.messages || [];
        // Get system and first user message for context on what the gear does
        const systemMessage = messages.find(m => m.role === "system")?.content || "";
        const userMessage = messages.find(m => m.role === "user")?.content || "";
        
        return {
          id: gear?.id || "",
          label: gear?.label || "",
          systemPrompt: systemMessage.substring(0, 200), // First 200 chars of system prompt
          userPrompt: userMessage.substring(0, 200),     // First 200 chars of user prompt
        };
      });
    
    // Collect information about the connections between gears
    const connectionInfo = patch.edges.map(edge => {
      const sourceNode = patch.nodes.find(node => node.id === edge.source);
      const targetNode = patch.nodes.find(node => node.id === edge.target);
      return {
        source: sourceNode?.data.label || sourceNode?.data.gearId || "",
        target: targetNode?.data.label || targetNode?.data.gearId || "",
      };
    });
    
    // Always make the API call, even for empty patches
    
    // Compose a prompt for the LLM
    const prompt = `Generate a short, concise description (maximum 120 characters) of what this patch does.
The description should fit on a card and explain the functionality and purpose of the patch.

This patch contains ${gearInfo.length} gears with the following labels and purposes:
${gearInfo.map(g => `- ${g.label}: ${g.systemPrompt.substring(0, 100)}`).join('\n')}

The gears are connected with these data flows:
${connectionInfo.map(c => `- ${c.source} → ${c.target}`).join('\n')}

Generate ONLY the description text, nothing else. Keep it under 120 characters and make it informative yet concise.`;

    // Process with LLM
    console.log("Processing description generation request");
    
    console.log("Using non-streaming approach for description generation");
    
    // Use standard fetch API to make a request to OpenAI API
    // This is more compatible with edge runtime than the openai package
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      console.error("Missing OpenAI API key");
      return Response.json({ 
        error: "Server configuration error: Missing API key" 
      }, { status: 500 });
    }
    
    console.log("Making request to OpenAI API");
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',  // Using a more widely available model
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150
      })
    });
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", openaiResponse.status, errorText);
      return Response.json({ 
        error: `OpenAI API error: ${openaiResponse.status} ${errorText}` 
      }, { status: 500 });
    }
    
    const openaiData = await openaiResponse.json();
    console.log("OpenAI API response received");
    
    if (!openaiData.choices || !openaiData.choices[0] || !openaiData.choices[0].message) {
      console.error("Unexpected OpenAI API response format:", openaiData);
      return Response.json({ 
        error: "Invalid response from OpenAI API" 
      }, { status: 500 });
    }
    
    const description = openaiData.choices[0].message.content.trim();

    // Return a simple text response
    return new Response(description, {
      headers: {
        'Content-Type': 'text/plain',
      }
    });
  } catch (error) {
    console.error("Error in description API:", error);
    
    // Extract the actual error message
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return Response.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}