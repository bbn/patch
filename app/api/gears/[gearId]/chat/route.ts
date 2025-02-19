import { kv } from '@vercel/kv'
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'

export const runtime = 'edge'

export async function POST(req: Request, { params }: { params: { gearId: string } }) {
  const { messages } = await req.json()
  const gearId = params.gearId

  // Retrieve gear data from Vercel KV
  const gearData = await kv.get(`gear:${gearId}`)
  const systemPrompt = gearData?.systemPrompt || "You are a helpful assistant."

  const result = streamText({
    model: openai('gpt-4-turbo'),
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
  })

  return result.toDataStreamResponse()
}