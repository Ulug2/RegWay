import { useEffect, useRef, useState } from 'react'

// Slides its content in (from the left, the right, or below) the first time
// it scrolls into view. The motion is CSS (`.reveal` in index.css), so
// `prefers-reduced-motion` turns it into a plain appearance. Without
// IntersectionObserver the content simply shows.

export default function Reveal({
  from = 'up',
  delay = 0,
  className = '',
  children,
}: {
  from?: 'left' | 'right' | 'up'
  delay?: number
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (!el || shown) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [shown])

  return (
    <div ref={ref} className={`reveal reveal-from-${from} ${shown ? 'is-visible' : ''} ${className}`} style={{ transitionDelay: shown ? `${delay}ms` : undefined }}>
      {children}
    </div>
  )
}
