import React from "react";
import ReactFlow, { Handle, Position } from "reactflow";
import "reactflow/dist/style.css";

interface Gear {
  id: string;
  outputUrls: string[];
  messages: { role: string; content: string }[];
}

interface GearNodeProps {
  id: string;
  data: { label: string };
  isConnectable: boolean;
}

const GearNode: React.FC<GearNodeProps> = ({ id, data, isConnectable }) => {
  return (
    <div className="rounded-lg bg-white border-2 border-gray-200 p-4 w-40 h-20 flex items-center justify-center">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
      />
      <div>{data.label}</div>
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
      data: { label: `Gear ${gear.id}` },
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
      />
    </div>
  );
};
