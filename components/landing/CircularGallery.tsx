"use client"

import React, { useState, useEffect, useRef, useCallback, HTMLAttributes } from "react"

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
    const [isMobile, setIsMobile] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const animationFrameRef = useRef<number | null>(null)
    const touchStartX = useRef<number>(0)
    const touchStartY = useRef<number>(0)

    const addRotation = useCallback((delta: number) => {
      setRotation((prev) => prev + delta)
    }, [])

    useEffect(() => {
      const autoRotate = () => {
        setRotation((prev) => prev + autoRotateSpeed)
        animationFrameRef.current = requestAnimationFrame(autoRotate)
      }
      animationFrameRef.current = requestAnimationFrame(autoRotate)
      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      }
    }, [autoRotateSpeed])

    useEffect(() => {
      const mq = window.matchMedia("(max-width: 640px)")
      setIsMobile(mq.matches)
      const handler = () => setIsMobile(mq.matches)
      mq.addEventListener("change", handler)
      return () => mq.removeEventListener("change", handler)
    }, [])

    useEffect(() => {
      const el = containerRef.current
      if (!el) return
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        addRotation(e.deltaY * 0.5)
      }
      el.addEventListener("wheel", onWheel, { passive: false })
      return () => el.removeEventListener("wheel", onWheel)
    }, [addRotation])

    const anglePerItem = items.length > 0 ? 360 / items.length : 0
    const effectiveRadius = isMobile ? Math.min(radius * 0.7, 240) : radius

    const handleTouchStart = (e: React.TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
    }

    const handleTouchMove = (e: React.TouchEvent) => {
      const dx = e.touches[0].clientX - touchStartX.current
      const dy = e.touches[0].clientY - touchStartY.current
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        e.preventDefault()
        addRotation(dx * 0.5)
        touchStartX.current = e.touches[0].clientX
        touchStartY.current = e.touches[0].clientY
      }
    }

    return (
      <div
        ref={(node) => {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }}
        role="region"
        aria-label="Circular gallery - scroll or swipe to rotate"
        className={cn("circular-gallery", className)}
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(280px, 50vw, 420px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          perspective: 2000,
          touchAction: "pan-y",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
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
                  width: isMobile ? "min(200px, 75vw)" : "min(280px, 85vw)",
                  height: isMobile ? "min(260px, 40vh)" : "min(360px, 45vh)",
                  left: "50%",
                  top: "50%",
                  marginLeft: isMobile ? "min(-100px, -37.5vw)" : "min(-140px, -42.5vw)",
                  marginTop: isMobile ? "min(-130px, -20vh)" : "min(-180px, -22.5vh)",
                  transform: `rotateY(${itemAngle}deg) translateZ(${effectiveRadius}px)`,
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
                      background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)",
                      color: "#fff",
                    }}
                  >
                    <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0, textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.6)" }}>
                      {item.title}
                    </h3>
                    {item.subtitle && (
                      <p style={{ fontSize: "0.875rem", margin: "var(--space-xs) 0 0", opacity: 0.95, textShadow: "0 1px 2px rgba(0,0,0,0.9), 0 1px 4px rgba(0,0,0,0.5)" }}>
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
