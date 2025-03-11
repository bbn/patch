import { NextResponse } from "next/server";
import { Patch } from "@/lib/models/Patch";
import { NextRequest } from "next/server";

export const runtime = "edge";

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
        await patch.updateFromReactFlow({
          nodes: body.nodes,
          edges: body.edges || []
        });
      } else if (body.regenerate_description === true) {
        // Handle explicit request to regenerate description
        console.log(`Regenerating description for patch ${patchId} via PUT request`);
        await patch.generateDescription();
      }
      
      // Save the patch if any fields were updated
      await patch.save();
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
    
    // This will trigger cascade deletion of associated gears
    const success = await Patch.deleteById(patchId);
    
    if (!success) {
      return Response.json(
        { error: "Patch not found or could not be deleted" },
        { status: 404 }
      );
    }
    
    return Response.json({ 
      success: true,
      message: "Patch and all associated gears deleted successfully" 
    });
  } catch (error) {
    console.error(`Error deleting patch:`, error);
    return Response.json(
      { error: "Failed to delete patch" },
      { status: 500 }
    );
  }
}