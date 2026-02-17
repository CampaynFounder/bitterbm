/**
 * Scraper flow types - JSON-driven browser automation for court/public record sites
 */

export type WaitUntil = "domcontentloaded" | "load" | "networkidle"

// Step type discriminators
export type ScraperStep =
  | NavigateStep
  | PauseForLoginStep
  | SwitchFrameStep
  | SwitchFrameMainStep
  | WaitStep
  | FillFieldStep
  | DateRangeStep
  | SelectDropdownStep
  | CheckboxStep
  | ClickStep
  | ForEachOptionStep
  | ForEachResultStep
  | ExtractFieldStep
  | ExtractLinkStep
  | ExtractPdfUrlStep
  | ExtractTextStep
  | PaginateStep
  | StoreRowStep
  | DelayStep

export interface BaseStep {
  type: string
  label?: string
}

export interface NavigateStep extends BaseStep {
  type: "navigate"
  config: {
    url: string
    waitUntil?: WaitUntil
  }
}

export interface PauseForLoginStep extends BaseStep {
  type: "pause_for_login"
  config: {
    /** Seconds to wait (browser stays open; log in manually) */
    waitSeconds?: number
    /** Optional message shown in logs */
    message?: string
  }
}

/** Switch into an iframe. Use name, selector, or url (partial match). */
export interface SwitchFrameStep extends BaseStep {
  type: "switch_frame"
  config: {
    /** Frame name attribute */
    name?: string
    /** CSS selector for the iframe element (e.g. iframe#content, iframe[name="main"]) */
    selector?: string
    /** Frame URL (partial match) */
    url?: string
  }
}

/** Switch back to the main page (top-level document). */
export interface SwitchFrameMainStep extends BaseStep {
  type: "switch_frame_main"
  config?: Record<string, unknown>
}

export interface WaitStep extends BaseStep {
  type: "wait"
  config: {
    selector?: string
    timeout?: number
    waitUntil?: "visible" | "hidden" | "attached"
  }
}

export interface FillFieldStep extends BaseStep {
  type: "fill_field"
  config: {
    selector: string
    value: string
    method?: "fill" | "type"
    clearFirst?: boolean
    typeDelay?: number
    pressEnter?: boolean
  }
}

export interface DateRangeStep extends BaseStep {
  type: "date_range"
  config: {
    fromSelector: string
    toSelector: string
    fromValue: string
    toValue: string
    format?: string
    inputMethod?: "type" | "fill"
  }
}

export interface SelectDropdownStep extends BaseStep {
  type: "select_dropdown"
  config: {
    selector: string
    selectBy: "value" | "label" | "index"
    value: string
  }
}

export interface CheckboxStep extends BaseStep {
  type: "checkbox"
  config: {
    selector: string
    state: "checked" | "unchecked"
  }
}

export interface ClickStep extends BaseStep {
  type: "click"
  config: {
    selector: string
    waitAfter?: number
    waitForSelector?: string
    scrollIntoView?: boolean
  }
}

export interface ForEachOptionStep extends BaseStep {
  type: "for_each_option"
  config: {
    selector: string
    outputValueVar?: string
    outputTextVar?: string
    skipFirst?: boolean
  }
}

export interface ForEachResultStep extends BaseStep {
  type: "for_each_result"
  config: {
    selector: string
    limit?: number
    mode?: "dom" | "navigate"
    clickTarget?: string
  }
}

export interface ExtractFieldStep extends BaseStep {
  type: "extract_field"
  config: {
    fieldId: string
    selector: string
    attr?: "text" | "html" | "href" | "value" | string
    required?: boolean
    transform?: string
  }
}

export interface ExtractLinkStep extends BaseStep {
  type: "extract_link"
  config: {
    fieldId: string
    selector: string
    makeAbsolute?: boolean
  }
}

/** Extracts PDF link and appends to row.pdf_urls (or configurable array field) */
export interface ExtractPdfUrlStep extends BaseStep {
  type: "extract_pdf_url"
  config: {
    selector: string
    /** Target field (default pdf_urls). Accumulates into array. */
    fieldId?: string
    makeAbsolute?: boolean
  }
}

/** Extracts text content (page or element) into field */
export interface ExtractTextStep extends BaseStep {
  type: "extract_text"
  config: {
    fieldId: string
    /** Omit for full page text */
    selector?: string
  }
}

export interface PaginateStep extends BaseStep {
  type: "paginate"
  config: {
    selector: string
    stopWhen?: "disabled" | "missing"
    maxPages?: number
    waitAfter?: number
  }
}

export interface StoreRowStep extends BaseStep {
  type: "store_row"
  config: {
    table?: string
    flowId?: string
    sourceSite?: string
    /** Map extracted fieldId -> DB column (e.g. case_no -> case_number) */
    columnMap?: Record<string, string>
  }
}

export interface DelayStep extends BaseStep {
  type: "delay"
  config: {
    ms: number
  }
}

export interface ScraperFlow {
  name: string
  version?: string
  steps: ScraperStep[]
}

export interface ExecutionContext {
  vars: Record<string, string | number>
  row: Record<string, unknown>
  currentRow: unknown
  currentOption?: { value: string; text: string }
  currentFrame?: unknown // Playwright Frame or FrameLocator
  rowsStored: number
  pageNum: number
  jobId: string
  flowId?: string
  sourceSite?: string
}
