import React from "react";
import ReactFlow, { Handle, Position } from "reactflow";
import "reactflow/dist/style.css";

interface Gear {
  id: string;
  outputUrls: string[];
  messages: { role: string; content: string }[];
  label?: string;
}

interface GearNodeProps {
  id: string;
  data: { 
    label: string;
    isProcessing?: boolean;
  };
  isConnectable: boolean;
}

const GearNode: React.FC<GearNodeProps> = ({ id, data, isConnectable }) => {
  // Auto-adjust node size based on label length
  // Assuming average character width of 8px in the current font
  const charWidth = 8;
  const basePadding = 32; // 16px padding on each side 
  const minWidth = 160; // Minimum width in px
  
  // Calculate width needed for the text (with some minimal padding)
  const textWidth = data.label.length * charWidth + basePadding;
  // Use the larger of the minimum width or the calculated width
  const nodeWidth = Math.max(minWidth, textWidth);
  // Use inline style for dynamic width
  const widthStyle = { width: `${nodeWidth}px` };
  
  // Only log processing state changes in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`GearComponent: Rendering node ${id} with isProcessing=${Boolean(data.isProcessing)}`);
    }
  }, [id, data.isProcessing]);
    
  return (
    <div 
      style={widthStyle}
      className={`rounded-lg bg-white border-2 p-2 h-[80px] flex items-center justify-center overflow-hidden transition-all duration-300 ${
        data.isProcessing 
          ? "border-blue-500 shadow-md shadow-blue-200 animate-pulse" 
          : "border-gray-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
      />
      <div 
        className="text-center text-sm" 
        style={{ maxWidth: `${nodeWidth - basePadding}px` }} 
        title={data.label}
      >
        {data.label}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
      />
    </div>
  );
};

interface GearComponentProps {
  gear: Gear;
  onSelect: (id: string) => void;
}

export const GearComponent: React.FC<GearComponentProps> = ({
  gear,
  onSelect,
}) => {
  const nodes = [
    {
      id: gear.id,
      type: "gearNode",
      data: { label: gear.label || `Gear ${gear.id.slice(0, 8)}` },
      position: { x: 0, y: 0 },
    },
  ];

  const nodeTypes = {
    gearNode: GearNode,
  };

  return (
    <div
      className="h-[200px] w-full cursor-pointer"
      onClick={() => onSelect(gear.id)}
    >
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        fitView
        className="bg-white rounded-lg"
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
};
