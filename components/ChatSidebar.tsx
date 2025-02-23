"use client";

import { useState, useEffect } from "react";
import { useChat } from "ai/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ChatSidebarProps {
  gearId: string;
  initialMessages: { role: string; content: string }[];
  onMessageSent: (message: { role: string; content: string }) => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  gearId,
  initialMessages,
  onMessageSent,
}) => {
  const { messages, input, handleInputChange, handleSubmit, setMessages } =
    useChat({
      api: `/api/chat/${gearId}`,
      initialMessages,
    });
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    // Update messages when initialMessages change (e.g., when selecting a different gear)
    setMessages(initialMessages);
  }, [initialMessages, setMessages]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsTyping(true);
    handleSubmit(e).then(() => {
      setIsTyping(false);
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        onMessageSent(lastMessage);
      }
    });
  };

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <CardTitle>Chat with Gear {gearId}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto">
        {messages.map((m, index) => (
          <div
            key={index}
            className={`mb-4 ${m.role === "user" ? "text-right" : "text-left"}`}
          >
            <span
              className={`inline-block p-2 rounded-lg ${m.role === "user" ? "bg-blue-500 text-white" : "bg-gray-200 text-black"}`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {isTyping && (
          <div className="text-left">
            <span className="inline-block p-2 rounded-lg bg-gray-200 text-black">
              AI is typing...
            </span>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <form onSubmit={onSubmit} className="flex w-full space-x-2">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Type your message..."
            className="flex-grow"
          />
          <Button type="submit" disabled={isTyping}>
            Send
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};
