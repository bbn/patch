import { NextRequest, NextResponse } from "next/server";
import { Patch } from "@/lib/models/Patch";

// GET /api/patches/[patchId] - Get a specific patch by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { patchId: string } }
) {
  try {
    const { patchId } = params;
    const patch = await Patch.findById(patchId);
    
    if (!patch) {
      return NextResponse.json(
        { error: "Patch not found" },
        { status: 404 }
      );
    }
    
    // Return both the patch metadata and the ReactFlow data
    return NextResponse.json({
      id: patch.id,
      name: patch.name,
      description: patch.description,
      createdAt: patch.createdAt,
      updatedAt: patch.updatedAt,
      reactflow: patch.toReactFlowData(),
    });
  } catch (error) {
    console.error(`Error fetching patch ${params.patchId}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch patch" },
      { status: 500 }
    );
  }
}

// PUT /api/patches/[patchId] - Update a specific patch
export async function PUT(
  request: NextRequest,
  { params }: { params: { patchId: string } }
) {
  try {
    const { patchId } = params;
    const body = await request.json();
    
    const patch = await Patch.findById(patchId);
    if (!patch) {
      return NextResponse.json(
        { error: "Patch not found" },
        { status: 404 }
      );
    }
    
    // Update the patch with ReactFlow data
    if (body.reactflow) {
      await patch.updateFromReactFlow(body.reactflow);
    }
    
    return NextResponse.json({
      id: patch.id,
      name: patch.name,
      nodeCount: patch.nodes.length,
      updatedAt: patch.updatedAt,
    });
  } catch (error) {
    console.error(`Error updating patch ${params.patchId}:`, error);
    return NextResponse.json(
      { error: "Failed to update patch" },
      { status: 500 }
    );
  }
}

// DELETE /api/patches/[patchId] - Delete a specific patch
export async function DELETE(
  request: NextRequest,
  { params }: { params: { patchId: string } }
) {
  try {
    const { patchId } = params;
    const deleted = await Patch.deleteById(patchId);
    
    if (!deleted) {
      return NextResponse.json(
        { error: "Patch not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error deleting patch ${params.patchId}:`, error);
    return NextResponse.json(
      { error: "Failed to delete patch" },
      { status: 500 }
    );
  }
}