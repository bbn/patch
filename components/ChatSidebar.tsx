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
  // Format initialMessages for the useChat hook
  const formattedInitialMessages = initialMessages.map(msg => ({
    id: msg.id || crypto.randomUUID(),
    role: msg.role as "system" | "user" | "assistant" | "data",
    content: msg.content
  }));

  // Use the Vercel AI SDK useChat hook
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: `/api/gears/${gearId}/chat`,
    id: `chat-${gearId}`,
    initialMessages: formattedInitialMessages,
    onResponse: (response) => {
      // We won't handle the response here, but this could be used
      // for custom handling of specific response codes or headers
    },
    onFinish: (message) => {
      // When the AI response is complete, send it to the parent component
      if (message.content && message.role === "assistant") {
        onMessageSent({
          role: message.role,
          content: message.content
        });
      }
    },
  });

  // When user sends a message, we need to notify the parent
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Only proceed if there's content to send
    if (!input.trim()) return;
    
    // Save the current message to pass to onMessageSent after submission
    const currentMessage = input.trim();
    
    // Submit the form using the handler from useChat
    handleSubmit(e);
    
    // Notify parent of the new user message
    onMessageSent({
      role: "user",
      content: currentMessage
    });
  };

  return (
    <Card className="w-full h-full flex flex-col overflow-hidden">
      <CardHeader className="py-3">
        <CardTitle>Chat with Gear {gearId}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto pb-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`mb-4 ${m.role === "user" ? "text-right" : "text-left"}`}
          >
            <span
              className={`inline-block p-2 rounded-lg ${m.role === "user" ? "bg-blue-500 text-white" : "bg-gray-200 text-black"}`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {isLoading && (
          <div className="text-left">
            <span className="inline-block p-2 rounded-lg bg-gray-200 text-black">
              AI is thinking...
            </span>
          </div>
        )}
      </CardContent>
      <CardFooter className="py-3 border-t">
        <form onSubmit={handleFormSubmit} className="flex w-full space-x-2">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Type your message..."
            className="flex-grow"
          />
          <Button type="submit" disabled={isLoading}>
            Send
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};
