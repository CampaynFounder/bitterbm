"use client"

import { useEffect, useRef, useState, ReactNode } from "react"

interface AnimateOnScrollProps {
  children: ReactNode
  className?: string
  stagger?: 1 | 2 | 3 | 4 | 5
  threshold?: number
  rootMargin?: string
}

export function AnimateOnScroll({
  children,
  className = "",
  stagger,
  threshold = 0.15,
  rootMargin = "0px 0px -40px 0px",
}: AnimateOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true)
        }
      },
      { threshold, rootMargin, root: null }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, hasAnimated])

  const staggerDelay = stagger ? stagger * 80 : 0

  return (
    <div
      ref={ref}
      className={className}
      data-animate
      data-animated={hasAnimated}
      style={{
        opacity: hasAnimated ? 1 : 0,
        transform: hasAnimated ? "translateY(0)" : "translateY(20px)",
        transition: hasAnimated
          ? `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${staggerDelay}ms, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${staggerDelay}ms`
          : "none",
      }}
    >
      {children}
    </div>
  )
}
