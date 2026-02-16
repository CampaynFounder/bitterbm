import { ImageResponse } from "next/og"
import fs from "fs"
import path from "path"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  const logoPath = path.join(process.cwd(), "public", "logo.svg")
  const logoBuffer = fs.readFileSync(logoPath)
  const logoDataUrl = `data:image/svg+xml;base64,${logoBuffer.toString("base64")}`

  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: "#08090c",
        }}
      >
        <img
          src={logoDataUrl}
          alt=""
          width={32}
          height={32}
          style={{ objectFit: "cover" }}
        />
      </div>
    ),
    { ...size }
  )
}
