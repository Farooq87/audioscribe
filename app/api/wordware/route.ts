export async function POST(request: Request) {
  const { tweets, profilePicture, profileInfo } = await request.json()

  const runResponse = await fetch(`https://app.wordware.ai/api/released-app/${process.env.WORDWARE_PROMPT_ID}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WORDWARE_API_KEY}`,
    },
    body: JSON.stringify({
      inputs: {
        tweets,
        profilePicture,
        profileInfo,
        version: '^1.1',
      },
    }),
  })
  if (runResponse.status === 401) {
    return Response.json({ error: 'Wordware API key is invalid' })
  }
  if (!runResponse.ok) {
    return Response.json({ error: 'Failed to run prompt' })
  }

  const reader = runResponse.body?.getReader()
  if (!reader) return Response.json({ error: 'No reader' })

  const decoder = new TextDecoder()
  let buffer: string[] = []
  let finalOutput = false

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            controller.close()
            return
          }

          const chunk = decoder.decode(value)

          for (let i = 0, len = chunk.length; i < len; ++i) {
            const isChunkSeparator = chunk[i] === '\n'

            if (!isChunkSeparator) {
              buffer.push(chunk[i])
              continue
            }

            const line = buffer.join('').trimEnd()

            const content = JSON.parse(line)
            const value = content.value
            console.log('🟣 | file: route.ts:53 | start | value:', value)

            if (value.type === 'generation') {
              if (value.state === 'start') {
                if (value.label === 'output') {
                  finalOutput = true
                }
                console.log('\nNEW GENERATION -', value.label)
              } else {
                if (value.label === 'output') {
                  finalOutput = false
                }
                console.log('\nEND GENERATION -', value.label)
              }
            } else if (value.type === 'chunk') {
              if (finalOutput) {
                controller.enqueue(value.value ?? '')
              }
            } else if (value.type === 'outputs') {
              console.log(value)
            }

            buffer = []
          }
        }
      } finally {
        reader.releaseLock()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain' },
  })
}
