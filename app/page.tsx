'use client'

import { useState } from 'react'
import { useChat } from 'ai/react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardFooter } from "@/components/ui/card"

export default function Home() {
  const [gears, setGears] = useState([])

  const addGear = () => {
    const newGear = {
      id: `gear-${gears.length + 1}`,
      outputUrls: [],
      inputMessage: '',
      outputMessage: ''
    }
    setGears([...gears, newGear])
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gears Project</h1>
      <Button onClick={addGear} className="mb-4">Add Gear</Button>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {gears.map((gear) => (
          <GearComponent key={gear.id} gear={gear} setGears={setGears} gears={gears} />
        ))}
      </div>
    </div>
  )
}

function GearComponent({ gear, setGears, gears }) {
  const { messages, input, handleInputChange, handleSubmit, setMessages } = useChat({
    api: `/api/gears/${gear.id}/chat`,
  })

  const handleInputMessageChange = (e) => {
    const updatedGears = gears.map(g => 
      g.id === gear.id ? {...g, inputMessage: e.target.value} : g
    )
    setGears(updatedGears)
  }

  const processInputMessage = async () => {
    const inputMessage = gear.inputMessage
    if (!inputMessage) return

    try {
      const response = await fetch(`/api/gears/${gear.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputMessage: JSON.parse(inputMessage) }),
      })

      if (response.ok) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let outputMessage = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          outputMessage += decoder.decode(value)
        }

        setMessages([...messages, { role: 'user', content: `Input: ${inputMessage}` }, { role: 'assistant', content: outputMessage }])

        const updatedGears = gears.map(g => 
          g.id === gear.id ? {...g, outputMessage} : g
        )
        setGears(updatedGears)

        // Send output to connected gears
        gear.outputUrls.forEach(url => {
          const targetGearId = url.split('/').pop()
          const targetGear = gears.find(g => g.id === targetGearId)
          if (targetGear) {
            // Simulate sending message to target gear
            console.log(`Sending message from ${gear.id} to ${targetGearId}`)
          }
        })
      } else {
        console.error('Failed to process input message')
      }
    } catch (error) {
      console.error('Error processing input message:', error)
    }
  }

  return (
    <Card className="w-full">
      <CardContent>
        <h2 className="text-xl font-semibold mb-2">{gear.id}</h2>
        <div className="h-40 overflow-y-auto mb-4 border p-2 rounded">
          {messages.map((m, index) => (
            <div key={index} className="mb-2">
              <strong>{m.role}:</strong> {m.content}
            </div>
          ))}
        </div>
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
        <div className="mb-2">
          <h3 className="font-semibold mb-1">Output Message:</h3>
          <Textarea
            value={gear.outputMessage}
            readOnly
            className="mb-2"
          />
        </div>
        <div className="mb-2">
          <Input
            placeholder="Add output URL"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                const newUrl = e.target.value
                setGears(gears.map(g => 
                  g.id === gear.id 
                    ? {...g, outputUrls: [...g.outputUrls, newUrl]} 
                    : g
                ))
                e.target.value = ''
              }
            }}
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
      </CardContent>
      <CardFooter>
        <form onSubmit={handleSubmit} className="flex w-full space-x-2">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Type your message..."
            className="flex-grow"
          />
          <Button type="submit">Send</Button>
        </form>
      </CardFooter>
    </Card>
  )
}