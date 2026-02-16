import type { Metadata } from "next"
import { GA4Provider } from "@/components/GA4Provider"
import { HamburgerMenu } from "@/components/landing/HamburgerMenu"
import "./globals.css"

export const metadata: Metadata = {
  title: "Stop Parental Alienation | Your Kids Deserve Better - Court-Ready Evidence",
  description:
    "Document every denied visit, cancelled call, and broken promise. Build court-ready evidence to prove parental alienation. Track visitation denials and get your report in 48 hours.",
  keywords: [
    "prove parental alienation",
    "document parental alienation",
    "prove denied visitation",
    "document denied visits",
    "custody evidence tracker",
    "parental alienation laws",
    "court-ready custody evidence",
    "visitation documentation",
  ].join(", "),
  openGraph: {
    title: "Prove Parental Alienation | Document Denied Visitation",
    description: "Document every denied visit—court-ready reports in 48 hours.",
    type: "website",
  },
  robots: "index, follow",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <GA4Provider />
        <HamburgerMenu visible />
        {children}
      </body>
    </html>
  )
}
