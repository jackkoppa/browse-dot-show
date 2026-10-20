import { useEffect, useRef } from 'react'

/** Adds `is-revealed` to each `.bds-reveal` inside the returned ref once it scrolls into view (see motion.css) */
export function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const elements = ref.current?.querySelectorAll('.bds-reveal') ?? []
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed')
          observer.unobserve(entry.target)
        }
      }),
      { rootMargin: '0px 0px -10% 0px' },
    )
    elements.forEach(element => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  return ref
}
