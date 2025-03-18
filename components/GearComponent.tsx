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
  // Truncate label if it's too long to fit in the node
  const displayLabel = data.label.length > 25 
    ? data.label.substring(0, 22) + '...' 
    : data.label;
  
  // Add debug logging for animation state
  React.useEffect(() => {
    console.log(`GearComponent: Rendering node ${id} with isProcessing=${Boolean(data.isProcessing)}, applying ${data.isProcessing ? 'animation' : 'normal'} classes`);
  }, [id, data.isProcessing]);
    
  return (
    <div 
      className={`rounded-lg bg-white border-2 p-2 w-[160px] h-[80px] flex items-center justify-center overflow-hidden transition-all duration-300 ${
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
      <div className="text-center text-sm truncate max-w-[140px]" title={data.label}>
        {displayLabel}
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
