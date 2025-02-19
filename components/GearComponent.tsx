
'use client'

import { useChat } from 'ai/react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { ChangeEvent, KeyboardEvent } from 'react'

interface Gear {
  id: string
  outputUrls: string[]
  inputMessage: string
  outputMessage: string
}

interface GearComponentProps {
  gear: Gear
  setGears: (gears: Gear[]) => void
  gears: Gear[]
}

export function GearComponent({ gear, setGears, gears }: GearComponentProps) {
  const { messages, input, handleInputChange, handleSubmit, setMessages } = useChat({
    api: `/api/gears/${gear.id}/chat`,
  })

  // Event Handlers
  const handleInputMessageChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const updatedGears = gears.map(g => 
      g.id === gear.id ? {...g, inputMessage: e.target.value} : g
    )
    setGears(updatedGears)
  }

  const handleUrlKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const newUrl = (e.target as HTMLInputElement).value
      setGears(gears.map(g => 
        g.id === gear.id 
          ? {...g, outputUrls: [...g.outputUrls, newUrl]} 
          : g
      ))
      ;(e.target as HTMLInputElement).value = ''
    }
  }

  // Message Processing
  const processInputMessage = async () => {
    if (!gear.inputMessage) return

    try {
      const response = await fetch(`/api/gears/${gear.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputMessage: JSON.parse(gear.inputMessage) }),
      })

      if (!response.ok || !response.body) {
        throw new Error('Failed to process input message')
      }

      let outputMessage = await streamResponse(response)
      updateMessages(outputMessage)
      propagateToConnectedGears()
    } catch (error) {
      console.error('Error processing input message:', error)
    }
  }

  // Helper Functions
  const streamResponse = async (response: Response) => {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let outputMessage = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      outputMessage += decoder.decode(value)
    }

    return outputMessage
  }

  const updateMessages = (outputMessage: string) => {
    setMessages([
      ...messages, 
      { role: 'user', content: `Input: ${gear.inputMessage}` }, 
      { role: 'assistant', content: outputMessage }
    ])

    setGears(gears.map(g => 
      g.id === gear.id ? {...g, outputMessage} : g
    ))
  }

  const propagateToConnectedGears = () => {
    gear.outputUrls.forEach(url => {
      const targetGearId = url.split('/').pop()
      const targetGear = gears.find(g => g.id === targetGearId)
      if (targetGear) {
        console.log(`Sending message from ${gear.id} to ${targetGearId}`)
      }
    })
  }

  // Render Sections
  const renderMessageHistory = () => (
    <div className="h-40 overflow-y-auto mb-4 border p-2 rounded">
      {messages.map((m, index) => (
        <div key={index} className="mb-2">
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}
    </div>
  )

  const renderInputSection = () => (
    <div className="mb-2">
      <h3 className="font-semibold mb-1">Input Message:</h3>
      <Textarea
        value={gear.inputMessage}
        onChange={handleInputMessageChange}
        placeholder="Enter JSON input message"
        className="mb-2"
      />
      <Button onClick={processInputMessage}>Process Input</Button>
    </div>
  )

  const renderOutputSection = () => (
    <div className="mb-2">
      <h3 className="font-semibold mb-1">Output Message:</h3>
      <Textarea
        value={gear.outputMessage}
        readOnly
        className="mb-2"
      />
    </div>
  )

  const renderUrlSection = () => (
    <>
      <div className="mb-2">
        <Input
          placeholder="Add output URL"
          onKeyPress={handleUrlKeyPress}
        />
      </div>
      <div>
        <h3 className="font-semibold">Output URLs:</h3>
        <ul>
          {gear.outputUrls.map((url, index) => (
            <li key={index}>{url}</li>
          ))}
        </ul>
      </div>
    </>
  )

  const renderChatInput = () => (
    <form onSubmit={handleSubmit} className="flex w-full space-x-2">
      <Input
        value={input}
        onChange={handleInputChange}
        placeholder="Type your message..."
        className="flex-grow"
      />
      <Button type="submit">Send</Button>
    </form>
  )

  return (
    <Card className="w-full">
      <CardContent>
        <h2 className="text-xl font-semibold mb-2">{gear.id}</h2>
        {renderMessageHistory()}
        {renderInputSection()}
        {renderOutputSection()}
        {renderUrlSection()}
      </CardContent>
      <CardFooter>
        {renderChatInput()}
      </CardFooter>
    </Card>
  )
}
