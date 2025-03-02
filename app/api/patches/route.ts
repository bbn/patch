import { NextRequest, NextResponse } from "next/server";
import { Patch } from "@/lib/models/Patch";

export async function GET(request: NextRequest) {
  try {
    const patches = await Patch.findAll();
    const patchSummaries = patches.map(patch => ({
      id: patch.id,
      name: patch.name,
      description: patch.description,
      nodeCount: patch.nodes.length,
      updatedAt: patch.updatedAt,
      createdAt: patch.createdAt,
    }));
    
    return NextResponse.json(patchSummaries);
  } catch (error) {
    console.error("Error fetching patches:", error);
    return NextResponse.json(
      { error: "Failed to fetch patches" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (\!body.id || \!body.name) {
      return NextResponse.json(
        { error: "Missing required fields: id, name" },
        { status: 400 }
      );
    }
    
    const patch = await Patch.create({
      id: body.id,
      name: body.name,
      description: body.description || "",
      nodes: body.nodes || [],
      edges: body.edges || [],
    });
    
    return NextResponse.json({
      id: patch.id,
      name: patch.name,
      nodeCount: patch.nodes.length
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating patch:", error);
    return NextResponse.json(
      { error: "Failed to create patch" },
      { status: 500 }
    );
  }
}
