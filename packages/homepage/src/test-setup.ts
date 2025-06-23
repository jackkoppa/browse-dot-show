import '@testing-library/jest-dom'
import { vi } from 'vitest'
import React from 'react'

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
})

// Mock localStorage
const localStorageMock = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _value: string) => {},
  removeItem: (_key: string) => {},
  clear: () => {},
  length: 0,
  key: (_index: number) => null,
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

// Mock AudioPlayer component to avoid SVG import issues
vi.mock('@/components/AudioPlayer/AudioPlayer', () => ({
  default: React.forwardRef((props: any, ref: any) => {
    // Filter out component-specific props that shouldn't be passed to DOM elements
    const { ...domProps } = props
    return React.createElement('div', { 
      ...domProps, 
      ref, 
      'data-testid': 'mock-audio-player',
      children: 'Mock Audio Player'
    })
  }),
}))

// Mock SVG imports - more comprehensive approach
vi.mock('*.svg?react', () => ({
  default: React.forwardRef((props: any, ref: any) => 
    React.createElement('svg', { ...props, ref, 'data-testid': 'mocked-svg' })
  ),
}))

// Mock regular SVG imports (not as React components)
vi.mock('*.svg', () => ({
  default: 'mocked-svg-url',
}))

// Mock fetch globally
global.fetch = vi.fn()

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_SEARCH_API_URL: 'http://localhost:3001',
    VITE_S3_HOSTED_FILES_BASE_URL: 'http://localhost:8080/',
  },
  writable: true,
}) 