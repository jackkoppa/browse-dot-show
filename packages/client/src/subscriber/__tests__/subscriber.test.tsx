import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('../../config/site-config', () => ({
  default: {
    id: 'listenfairplay',
    subscriberAccess: {
      launchStatus: 'preview',
      providers: ['supporting-cast', 'dev-code'],
      subscriptionName: 'Football Clichés',
      subscribeUrl: 'https://example.com/subscribe',
      authApiUrl: 'https://auth.example.com',
    },
  },
}))

import { readSubscriberPreviewFlag } from '../preview-flag'
import { clearSession, loadSession, saveSession, shouldRefresh } from '../session'
import { SubscriberProvider, useSubscriber } from '../SubscriberContext'
import SubscriberLoginDialog from '../SubscriberLoginDialog'

const nowSeconds = () => Math.floor(Date.now() / 1000)

// test-setup.ts stubs localStorage out; these tests need one that stores
const store = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => store.clear(),
  },
})

beforeEach(() => {
  localStorage.clear()
  vi.mocked(global.fetch).mockReset()
  window.history.replaceState({}, '', '/')
})

describe('preview flag', () => {
  it('is turned on and off by the query param, and remembered', () => {
    expect(readSubscriberPreviewFlag('')).toBe(false)
    expect(readSubscriberPreviewFlag('?subscriberPreview=1')).toBe(true)
    expect(readSubscriberPreviewFlag('')).toBe(true)
    expect(readSubscriberPreviewFlag('?subscriberPreview=0')).toBe(false)
    expect(readSubscriberPreviewFlag('')).toBe(false)
  })
})

describe('session', () => {
  it('is stored per site, and dropped once expired', () => {
    saveSession('listenfairplay', { token: 't', expiresAt: nowSeconds() + 3600 })
    expect(loadSession('listenfairplay')?.token).toBe('t')
    expect(loadSession('libero')).toBeNull()

    saveSession('listenfairplay', { token: 't', expiresAt: nowSeconds() - 1 })
    expect(loadSession('listenfairplay')).toBeNull()
    clearSession('listenfairplay')
  })

  it('needs refreshing in its last 2 days', () => {
    expect(shouldRefresh({ token: 't', expiresAt: nowSeconds() + 7 * 86400 })).toBe(false)
    expect(shouldRefresh({ token: 't', expiresAt: nowSeconds() + 86400 })).toBe(true)
  })
})

function SubscriberStatus() {
  const { isSubscriber } = useSubscriber()
  return <span data-testid="status">{isSubscriber ? 'subscriber' : 'anonymous'}</span>
}

describe('SubscriberProvider and login dialog', () => {
  it('stays hidden in preview without the flag', () => {
    render(<SubscriberProvider><SubscriberLoginDialog /><SubscriberStatus /></SubscriberProvider>)
    expect(screen.queryByRole('button', { name: 'Subscriber login' })).not.toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
  })

  it('logs in with the preview code', async () => {
    window.history.replaceState({}, '', '/?subscriberPreview=1')
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ token: 'session-token', expiresAt: nowSeconds() + 7 * 86400 }), { status: 200 }))

    render(<SubscriberProvider><SubscriberLoginDialog /><SubscriberStatus /></SubscriberProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Subscriber login' }))
    fireEvent.change(await screen.findByLabelText('Preview code'), { target: { value: 'the-dev-code-0123456789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in with code' }))

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('subscriber'))
    const [url, init] = vi.mocked(global.fetch).mock.calls[0]
    expect(url).toBe('https://auth.example.com/complete')
    expect(JSON.parse(init!.body as string)).toEqual({ siteId: 'listenfairplay', provider: 'dev-code', params: { code: 'the-dev-code-0123456789' } })
    expect(loadSession('listenfairplay')?.token).toBe('session-token')
  })

  it('shows an error for a wrong code', async () => {
    window.history.replaceState({}, '', '/?subscriberPreview=1')
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'not-a-subscriber' }), { status: 401 }))

    render(<SubscriberProvider><SubscriberLoginDialog /><SubscriberStatus /></SubscriberProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Subscriber login' }))
    fireEvent.change(await screen.findByLabelText('Preview code'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in with code' }))

    expect(await screen.findByText("That code didn't work.")).toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
  })

  it('sends a login email for Supporting Cast, returning to this origin', async () => {
    window.history.replaceState({}, '', '/?subscriberPreview=1')
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ result: { kind: 'email-sent' } }), { status: 200 }))

    render(<SubscriberProvider><SubscriberLoginDialog /></SubscriberProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Subscriber login' }))
    fireEvent.change(await screen.findByLabelText('The email you subscribe with'), { target: { value: 'fan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a login link' }))

    expect(await screen.findByText(/we've sent it a login link/)).toBeInTheDocument()
    const [url, init] = vi.mocked(global.fetch).mock.calls[0]
    expect(url).toBe('https://auth.example.com/login')
    expect(JSON.parse(init!.body as string)).toEqual({ siteId: 'listenfairplay', provider: 'supporting-cast', email: 'fan@example.com', origin: window.location.origin })
  })
})
