"use client"

import React, { useState, useEffect, useRef, HTMLAttributes } from "react"

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ")
}

export interface GalleryItem {
  title: string
  subtitle?: string
  photo: {
    url: string
    alt: string
    position?: string
  }
}

interface CircularGalleryProps extends HTMLAttributes<HTMLDivElement> {
  items: GalleryItem[]
  radius?: number
  autoRotateSpeed?: number
}

const CircularGallery = React.forwardRef<HTMLDivElement, CircularGalleryProps>(
  ({ items, className, radius = 400, autoRotateSpeed = 0.02, ...props }, ref) => {
    const [rotation, setRotation] = useState(0)
    const [isScrolling, setIsScrolling] = useState(false)
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const animationFrameRef = useRef<number | null>(null)

    useEffect(() => {
      const handleScroll = () => {
        setIsScrolling(true)
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
        const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight
        const scrollProgress = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0
        setRotation(scrollProgress * 360)
        scrollTimeoutRef.current = setTimeout(() => setIsScrolling(false), 150)
      }
      window.addEventListener("scroll", handleScroll, { passive: true })
      return () => {
        window.removeEventListener("scroll", handleScroll)
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      }
    }, [])

    useEffect(() => {
      const autoRotate = () => {
        if (!isScrolling) setRotation((prev) => prev + autoRotateSpeed)
        animationFrameRef.current = requestAnimationFrame(autoRotate)
      }
      animationFrameRef.current = requestAnimationFrame(autoRotate)
      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      }
    }, [isScrolling, autoRotateSpeed])

    const anglePerItem = items.length > 0 ? 360 / items.length : 0

    return (
      <div
        ref={ref}
        role="region"
        aria-label="Circular gallery"
        className={cn("circular-gallery", className)}
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(280px, 50vw, 420px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          perspective: 2000,
        }}
        {...props}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transform: `rotateY(${rotation}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          {items.map((item, i) => {
            const itemAngle = i * anglePerItem
            const totalRotation = rotation % 360
            const relativeAngle = (itemAngle + totalRotation + 360) % 360
            const normalizedAngle = Math.abs(relativeAngle > 180 ? 360 - relativeAngle : relativeAngle)
            const opacity = Math.max(0.25, 1 - normalizedAngle / 180)

            return (
              <div
                key={item.photo.url}
                role="group"
                aria-label={item.title}
                className="circular-gallery-item"
                style={{
                  position: "absolute",
                  width: "min(280px, 85vw)",
                  height: "min(360px, 45vh)",
                  left: "50%",
                  top: "50%",
                  marginLeft: "min(-140px, -42.5vw)",
                  marginTop: "min(-180px, -22.5vh)",
                  transform: `rotateY(${itemAngle}deg) translateZ(${radius}px)`,
                  opacity,
                  transition: "opacity 0.3s linear",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <img
                    src={item.photo.url}
                    alt={item.photo.alt}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: item.photo.position || "center",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: "var(--space-lg)",
                      background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                      {item.title}
                    </h3>
                    {item.subtitle && (
                      <p style={{ fontSize: "0.875rem", margin: "var(--space-xs) 0 0", opacity: 0.9 }}>
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)

CircularGallery.displayName = "CircularGallery"

export { CircularGallery }
