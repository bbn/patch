import { NextRequest, NextResponse } from "next/server";
import { Patch } from "@/lib/models/Patch";

export async function GET(
  request: NextRequest,
  context: { params: { patchId: string } }
) {
  try {
    const patchId = context.params.patchId;
    const patch = await Patch.findById(patchId);
    
    if (\!patch) {
      return NextResponse.json(
        { error: "Patch not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      id: patch.id,
      name: patch.name,
      description: patch.description,
      createdAt: patch.createdAt,
      updatedAt: patch.updatedAt,
      reactflow: patch.toReactFlowData(),
    });
  } catch (error) {
    console.error(`Error fetching patch:`, error);
    return NextResponse.json(
      { error: "Failed to fetch patch" },
      { status: 500 }
    );
  }
}
