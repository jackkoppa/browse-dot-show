import { useState, useEffect, useCallback } from 'react'
import { useRenderTracker } from './useRenderTracker'
import siteConfig from '../config/site-config'

type Theme = 'light' | 'dark'

/**
 * Optimized theme hook with performance tracking
 */
export function useOptimizedTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage first, then system preference
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored) return stored
    
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useRenderTracker('useOptimizedTheme')

  const applyTheme = useCallback((newTheme: Theme) => {
    const root = document.documentElement
    
    // Remove both classes first
    root.classList.remove('light', 'dark')
    
    // Add the current theme class
    root.classList.add(newTheme)

    // Set PWA theme color
    const themeColor = newTheme === 'dark' ? siteConfig.themeColorDark : siteConfig.themeColor
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor)
    
    // Store in localStorage
    localStorage.setItem('theme', newTheme)
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme, applyTheme])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }, [])

  return { theme, toggleTheme }
}