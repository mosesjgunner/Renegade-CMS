import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }))
vi.mock('../../src/modules/core/external-boundary', () => ({
  safeFetch: mocks.safeFetch,
  readBoundedJson: async (response: Response) => response.json(),
}))

import {
  discoverAiModels,
  ollamaAdapter,
  openAiCompatibleAdapter,
} from '../../src/modules/ai/gateway'
import {
  testAiProvider,
  validateConnectionInput,
  validateDiscoveryInput,
} from '../../src/modules/ai/connections'

beforeEach(() => mocks.safeFetch.mockReset())

describe('tested AI provider HTTP contracts', () => {
  it('forwards optional local bearer authentication for discovery and generate', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'local' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: 'proposal' })))
    await discoverAiModels('ai.ollama', 'http://127.0.0.1:11434', 'local-key')
    await ollamaAdapter('http://127.0.0.1:11434', 'local-key').complete({
      model: 'local',
      prompt: 'data',
      structured: false,
      signal: AbortSignal.timeout(1000),
    })
    expect(
      mocks.safeFetch.mock.calls.every(
        (call) => call[1].headers.Authorization === 'Bearer local-key',
      ),
    ).toBe(true)
    expect(mocks.safeFetch.mock.calls.every((call) => call[2].maxRedirects === 0)).toBe(true)
    expect(mocks.safeFetch.mock.calls[1][2].timeoutMs).toBe(25_000)
  })
  it('requires an explicit supported adapter and rejects prototype task names', () => {
    expect(() =>
      validateDiscoveryInput({
        siteId: 'site',
        providerKey: 'made-up',
        endpoint: 'https://provider.example',
      }),
    ).toThrow('tested provider')
    expect(() =>
      validateConnectionInput({
        siteId: 'site',
        providerKey: 'ai.ollama',
        endpoint: 'http://127.0.0.1:11434',
        label: 'Local',
        model: 'local',
        allowedTasks: ['toString'],
      }),
    ).toThrow('registered AI task')
  })
  it('does not grant JSON capability when a model ignores JSON mode', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'text-only' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: 'Text proposal' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: 'Not JSON' })))
    expect(
      await testAiProvider({
        providerKey: 'ai.ollama',
        endpoint: 'http://127.0.0.1:11434',
        apiKey: '',
        model: 'text-only',
      }),
    ).toEqual({ models: ['text-only'], capabilities: ['ai.text.rewrite'] })
  })
  it('rejects bad credentials before granting any capability and never echoes provider content', async () => {
    mocks.safeFetch.mockResolvedValue(new Response('secret echoed by upstream', { status: 401 }))
    await expect(
      testAiProvider({
        providerKey: 'ai.openai-compatible',
        endpoint: 'https://provider.example/v1',
        apiKey: 'secret',
        model: 'model',
      }),
    ).rejects.toThrow('Model discovery failed (401). Check the endpoint and credentials.')
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1)
  })
  it('does not probe an unadvertised model or accept empty text', async () => {
    mocks.safeFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ models: [{ name: 'other' }] })),
    )
    const input = {
      providerKey: 'ai.ollama' as const,
      endpoint: 'http://127.0.0.1:11434',
      apiKey: '',
      model: 'model',
    }
    await expect(testAiProvider(input)).rejects.toThrow('not advertised')
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1)
    mocks.safeFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'model' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: '' })))
    await expect(testAiProvider(input)).rejects.toThrow('returned no text')
  })
  it('uses authenticated OpenAI-compatible chat completions and JSON mode', async () => {
    mocks.safeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"title":"Suggestion"}' } }],
          usage: { prompt_tokens: 9, completion_tokens: 4 },
        }),
        { status: 200 },
      ),
    )
    const result = await openAiCompatibleAdapter(
      'ai.openai-compatible',
      'https://provider.example/v1',
      'test-secret',
    ).complete({
      model: 'tested-model',
      prompt: 'Data only',
      signal: new AbortController().signal,
      maxOutputTokens: 100,
      structured: true,
    })
    expect(result).toEqual({ output: '{"title":"Suggestion"}', inputTokens: 9, outputTokens: 4 })
    const [url, init, options] = mocks.safeFetch.mock.calls[0]
    expect(url).toBe('https://provider.example/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer test-secret')
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'tested-model',
      max_tokens: 100,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: expect.stringContaining('untrusted data') },
        { role: 'user', content: 'Data only' },
      ],
    })
    expect(options).toEqual({ timeoutMs: 25_000, maxRedirects: 0 })
  })
  it('uses only local Ollama generate with non-streaming JSON mode', async () => {
    mocks.safeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ response: '{"altText":"River"}', prompt_eval_count: 11, eval_count: 7 }),
        { status: 200 },
      ),
    )
    const result = await ollamaAdapter('http://127.0.0.1:11434').complete({
      model: 'local-model',
      prompt: 'metadata',
      signal: new AbortController().signal,
      maxOutputTokens: 64,
      structured: true,
    })
    expect(result.output).toBe('{"altText":"River"}')
    const [url, init, options] = mocks.safeFetch.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:11434/api/generate')
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'local-model',
      stream: false,
      format: 'json',
      options: { num_predict: 64 },
    })
    expect(options).toMatchObject({ allowHttp: true, allowPrivate: true })
  })
  it('discovers advertised models through each explicit adapter endpoint', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'remote-model' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'local-model' }] })))
    expect(
      await discoverAiModels('ai.openai-compatible', 'https://provider.example/v1', 'key'),
    ).toEqual(['remote-model'])
    expect(await discoverAiModels('ai.ollama', 'http://127.0.0.1:11434')).toEqual(['local-model'])
    expect(mocks.safeFetch.mock.calls[0][0]).toBe('https://provider.example/v1/models')
    expect(mocks.safeFetch.mock.calls[1][0]).toBe('http://127.0.0.1:11434/api/tags')
  })
})

it('does not invent free usage when a provider omits its token counters', async () => {
  mocks.safeFetch.mockResolvedValue(new Response(JSON.stringify({ response: 'proposal' })))
  const result = await ollamaAdapter('http://127.0.0.1:11434').complete({
    model: 'local',
    prompt: 'data',
    signal: AbortSignal.timeout(1000),
    structured: false,
  })
  expect(Number.isNaN(result.inputTokens)).toBe(true)
  expect(Number.isNaN(result.outputTokens)).toBe(true)
})
