import { NextResponse } from "next/server";
import { Patch } from "@/lib/models/patch";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patchId: string }> }
) {
  try {
    const resolvedParams = await params;
    const patchId = resolvedParams.patchId;
    const patch = await Patch.findById(patchId);
    
    if (!patch) {
      return new Response("Patch not found", { status: 404 });
    }
    
    // Check for regenerate_description query parameter
    const regenerateDescription = req.nextUrl.searchParams.get('regenerate_description') === 'true';
    if (regenerateDescription) {
      console.log(`Manually regenerating description for patch ${patchId}`);
      await patch.generateDescription();
      await patch.save();
    }
    
    return Response.json({
      id: patch.id,
      name: patch.name,
      description: patch.description,
      createdAt: patch.createdAt,
      updatedAt: patch.updatedAt,
      nodes: patch.nodes,
      edges: patch.edges
    });
  } catch (error) {
    console.error(`Error fetching patch:`, error);
    return Response.json(
      { error: "Failed to fetch patch" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ patchId: string }> }
) {
  try {
    const resolvedParams = await params;
    const patchId = resolvedParams.patchId;
    const body = await req.json();
    
    let patch = await Patch.findById(patchId);
    
    if (!patch) {
      // Create new patch if it doesn't exist
      patch = await Patch.create({
        id: patchId,
        name: body.name || `Patch ${patchId}`,
        description: body.description || '',
        nodes: body.nodes || [],
        edges: body.edges || []
      });
    } else {
      // Update existing patch
      if (body.name !== undefined) {
        patch.name = body.name;
      }
      
      if (body.description !== undefined) {
        patch.description = body.description;
      }
      
      if (body.nodes) {
        // updateFromReactFlow will handle saving the patch, so we don't need to call save() again
        await patch.updateFromReactFlow({
          nodes: body.nodes,
          edges: body.edges || []
        });
      } else if (body.regenerate_description === true) {
        // Handle explicit request to regenerate description
        console.log(`Regenerating description for patch ${patchId} via PUT request`);
        await patch.generateDescription();
        // Still need to save for description-only updates
        await patch.save();
      } else {
        // Save the patch if any other fields were updated but no nodes/description change
        await patch.save();
      }
    }
    
    return Response.json({
      id: patch.id,
      name: patch.name,
      description: patch.description,
      success: true
    });
  } catch (error) {
    console.error(`Error updating patch:`, error);
    return Response.json(
      { error: "Failed to update patch" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ patchId: string }> }
) {
  try {
    const resolvedParams = await params;
    const patchId = resolvedParams.patchId;
    
    console.log(`API route: Received request to delete patch ${patchId}`);
    
    // First check if the patch exists
    const existingPatch = await Patch.findById(patchId);
    if (!existingPatch) {
      console.log(`API route: Patch ${patchId} not found for deletion`);
      return Response.json(
        { error: "Patch not found" },
        { status: 404 }
      );
    }
    
    // Count how many gears will be deleted
    const gearCount = existingPatch.nodes.length;
    console.log(`API route: Deleting patch ${patchId} with ${gearCount} associated gears`);
    
    // This will trigger cascade deletion of associated gears
    const success = await Patch.deleteById(patchId);
    
    if (!success) {
      console.error(`API route: Failed to delete patch ${patchId}`);
      return Response.json(
        { error: "Patch could not be deleted" },
        { status: 500 }
      );
    }
    
    console.log(`API route: Successfully deleted patch ${patchId} and ${gearCount} associated gears`);
    
    return Response.json({ 
      success: true,
      message: `Patch and ${gearCount} associated gears deleted successfully` 
    });
  } catch (error) {
    console.error(`API route: Error deleting patch:`, error);
    return Response.json(
      { error: `Failed to delete patch: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}