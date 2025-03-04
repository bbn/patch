import React, { useState, useEffect } from "react";
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
  data: { label: string };
  isConnectable: boolean;
}

const GearNode: React.FC<GearNodeProps> = ({ id, data, isConnectable }) => {
  const [prevLabel, setPrevLabel] = useState(data.label);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Truncate label if it's too long to fit in the node
  const displayLabel = data.label.length > 25 
    ? data.label.substring(0, 22) + '...' 
    : data.label;
  
  // Detect label changes and trigger animation
  useEffect(() => {
    if (data.label !== prevLabel && prevLabel !== "") {
      console.log(`ANIMATION DEBUG: Label changed from "${prevLabel}" to "${data.label}"`);
      setIsAnimating(true);
      
      // Reset animation after it completes
      const timer = setTimeout(() => {
        console.log(`ANIMATION DEBUG: Animation completed for "${data.label}"`);
        setIsAnimating(false);
        setPrevLabel(data.label);
      }, 2000); // longer duration to ensure it completes
      
      return () => clearTimeout(timer);
    } else {
      setPrevLabel(data.label);
    }
  }, [data.label, prevLabel]);
  
  // Different approach - conditionally render elements instead of just CSS classes
  return (
    <div className="rounded-lg bg-white border-2 border-gray-200 p-2 w-[160px] h-[80px] flex items-center justify-center overflow-hidden">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
      />
      {isAnimating ? (
        <div 
          className="text-center text-sm truncate max-w-[140px] animate-blink-fade" 
          title={data.label}
          style={{
            border: '2px solid yellow',
            borderRadius: '4px',
            padding: '4px',
            backgroundColor: 'lightyellow'
          }}
        >
          {displayLabel}
        </div>
      ) : (
        <div 
          className="text-center text-sm truncate max-w-[140px]" 
          title={data.label}
        >
          {displayLabel}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
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
