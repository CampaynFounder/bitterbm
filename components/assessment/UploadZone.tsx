"use client"

import { useCallback, useState } from "react"

const MAX_FREE_FILES = 2
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ACCEPT = "image/png,image/jpeg,image/jpg,application/pdf"

export type FileWithPreview = File & { preview?: string }

type Props = {
  maxFiles?: number
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
}

export function UploadZone({ maxFiles = MAX_FREE_FILES, onFilesSelected, disabled = false }: Props) {
  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateAndAdd = useCallback(
    (newFiles: FileList | File[]) => {
      setError(null)
      const list = Array.from(newFiles)
      const valid: FileWithPreview[] = []
      for (const f of list) {
        if (valid.length >= maxFiles) {
          setError(`Maximum ${maxFiles} file(s) allowed.`)
          break
        }
        if (f.size > MAX_FILE_SIZE_BYTES) {
          setError(`"${f.name}" is too large. Max 5MB per file.`)
          continue
        }
        const mt = f.type.toLowerCase()
        if (!["image/png", "image/jpeg", "image/jpg", "application/pdf"].includes(mt)) {
          setError(`"${f.name}": only PNG, JPG, PDF allowed.`)
          continue
        }
        const withPreview = f as FileWithPreview
        if (f.type.startsWith("image/")) {
          withPreview.preview = URL.createObjectURL(f)
        }
        valid.push(withPreview)
      }
      if (valid.length > 0) {
        const next = [...files, ...valid].slice(0, maxFiles)
        setFiles(next)
        onFilesSelected(next)
      }
    },
    [files, maxFiles, onFilesSelected]
  )

  const remove = (index: number) => {
    const f = files[index] as FileWithPreview
    if (f.preview) URL.revokeObjectURL(f.preview)
    const next = files.filter((_, i) => i !== index)
    setFiles(next)
    onFilesSelected(next)
    setError(null)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (disabled) return
    validateAndAdd(e.dataTransfer.files)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }

  const onDragLeave = () => setDragActive(false)

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    if (input.files) validateAndAdd(input.files)
    input.value = ""
  }

  return (
    <div className="upload-zone-wrapper">
      <div
        className={`upload-zone ${dragActive ? "upload-zone-drag" : ""} ${disabled ? "upload-zone-disabled" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          border: "2px dashed var(--border-accent)",
          borderRadius: "12px",
          padding: "var(--space-xl)",
          textAlign: "center",
          transition: "border-color 300ms, background 300ms",
          background: dragActive ? "var(--bg-elevated)" : "var(--bg-card)",
        }}
      >
        <input
          type="file"
          accept={ACCEPT}
          multiple
          onChange={onInputChange}
          disabled={disabled}
          style={{ display: "none" }}
          id="evidence-upload"
        />
        <label htmlFor="evidence-upload" style={{ cursor: disabled ? "not-allowed" : "pointer" }}>
          <span className="icon-pulse" style={{ display: "inline-block", fontSize: "2rem", marginBottom: "var(--space-md)" }}>
            📸
          </span>
          <p style={{ marginBottom: "var(--space-xs)", fontWeight: 600 }}>
            Upload screenshot(s) of texts, emails, or evidence
          </p>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
            PNG, JPG, PDF · Up to {maxFiles} file(s) · 5MB each
          </p>
        </label>
      </div>
      {error && (
        <p style={{ color: "var(--accent-cyan)", fontSize: "0.875rem", marginTop: "var(--space-sm)" }}>{error}</p>
      )}
      {files.length > 0 && (
        <div style={{ marginTop: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-md)",
                padding: "var(--space-md)",
                background: "var(--bg-elevated)",
                borderRadius: "8px",
              }}
            >
              {(f as FileWithPreview).preview ? (
                <img
                  src={(f as FileWithPreview).preview}
                  alt=""
                  style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "4px" }}
                />
              ) : (
                <span style={{ fontSize: "1.5rem" }}>📄</span>
              )}
              <span style={{ flex: 1, fontSize: "0.9375rem", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove file"
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "var(--space-xs)" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
