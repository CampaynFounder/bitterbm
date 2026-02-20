/**
 * Playwright-based scraper flow executor
 * Runs JSON-defined steps against a browser page
 */
import type { Page, Frame, FrameLocator, Locator } from "playwright"
import { interpolate, interpolateObject } from "./interpolate"
import type {
  ScraperFlow,
  ScraperStep,
  ExecutionContext,
  NavigateStep,
  PauseForLoginStep,
  SwitchFrameStep,
  SwitchFrameMainStep,
  WaitStep,
  FillFieldStep,
  DateRangeStep,
  SelectDropdownStep,
  CheckboxStep,
  ClickStep,
  ForEachOptionStep,
  ForEachResultStep,
  ForEachIdStep,
  ConditionGroupStep,
  ExtractFieldStep,
  ExtractLinkStep,
  ExtractPdfUrlStep,
  ExtractToMemoryStep,
  ExtractTextStep,
  ExtractPdfStep,
  PaginateStep,
  StoreRowStep,
  StoreMemoryStep,
  DelayStep,
} from "./types"

const RESULT_NESTED_TYPES = new Set([
  "condition_group",
  "click",
  "wait",
  "extract_field",
  "extract_link",
  "extract_pdf_url",
  "extract_to_memory",
  "extract_text",
  "extract_pdf",
  "store_memory",
  "store_row",
])

function getNestedStepRange(
  steps: ScraperStep[],
  startIndex: number,
  loopType: "for_each_result" | "for_each_option" | "for_each_id"
): number {
  let j = startIndex + 1
  if (loopType === "for_each_result" || loopType === "for_each_id") {
    while (j < steps.length && RESULT_NESTED_TYPES.has(steps[j].type)) {
      j++
    }
  } else {
    while (j < steps.length && steps[j].type !== "for_each_option") {
      j++
    }
  }
  return j
}

/** Find the first frame (main or iframe) that contains the selector. Used when element is in an iframe. */
async function findFrameWithSelector(
  page: Page,
  selector: string,
  timeoutMs: number
): Promise<Frame | null> {
  const frames = page.frames()
  for (const frame of frames) {
    try {
      await frame.locator(selector).first().waitFor({ state: "attached", timeout: timeoutMs })
      return frame
    } catch {
      continue
    }
  }
  return null
}

export type StoreRowFn = (row: Record<string, unknown>, ctx: ExecutionContext) => Promise<void>

export type StorePdfDocumentFn = (data: {
  pdfUrl: string
  row: Record<string, unknown>
  ctx: ExecutionContext
  /** Single screenshot (extract_pdf screenshot: true) */
  screenshotBuffer?: Buffer
  /** Per-page screenshots (extract_pdf screenshotAllPages: true); each saved to DB */
  screenshotBuffers?: Buffer[]
}) => Promise<void>

export interface ExecutorOptions {
  flow: ScraperFlow
  /** Vars for interpolation; ids (string[]) used by for_each_id when running retrieval with superset list */
  vars: Record<string, string | number | string[]>
  jobId: string
  flowId?: string
  sourceSite?: string
  onStoreRow: StoreRowFn
  /** Called by extract_pdf step to store PDF to pdf_documents + Supabase storage */
  onStorePdfDocument?: StorePdfDocumentFn
  onLog?: (msg: string) => void
  /** When provided, called for pause_for_login instead of waiting fixed seconds (for headed/local runs) */
  onPause?: (message?: string) => Promise<void>
  /** Stop after this step index (0-based). For checkpoint debugging. */
  stopAtStep?: number
}

export interface ExecuteResult {
  rowsStored: number
  error?: string
  stoppedAt?: number
  pageUrl?: string
}

export async function executeFlow(
  page: Page,
  options: ExecutorOptions
): Promise<ExecuteResult> {
  const { flow, vars, jobId, flowId, sourceSite, onStoreRow, onStorePdfDocument, onLog, onPause, stopAtStep } = options
  const log = onLog ?? (() => {})

  const memory: Record<string, string | number> = {}
  if (flow.geographic?.fromVars) {
    if (flow.geographic.state != null) memory.state = flow.geographic.state
    else if (vars.state != null) memory.state = String(vars.state)
    if (flow.geographic.county != null) memory.county = flow.geographic.county
    else if (vars.county != null) memory.county = String(vars.county)
  }

  const ctx: ExecutionContext = {
    vars: { ...vars, job_id: jobId },
    row: {},
    memory,
    currentRow: null,
    currentFrame: undefined,
    rowsStored: 0,
    pageNum: 1,
    jobId,
    flowId,
    sourceSite,
  }

  const steps = flow.steps
  let i = 0

  while (i < steps.length) {
    if (stopAtStep !== undefined && i > stopAtStep) {
      log(`Checkpoint: stopped after step ${stopAtStep + 1}`)
      return {
        rowsStored: ctx.rowsStored,
        stoppedAt: stopAtStep,
        pageUrl: page.url(),
      }
    }
    const step = steps[i]
    try {
      const result = await executeStep(
        page,
        step,
        steps,
        i,
        ctx,
        { onStoreRow, onStorePdfDocument, log, onPause }
      )
      if (result?.nextIndex !== undefined) {
        i = result.nextIndex
      } else {
        i++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Step ${i + 1} (${step.type}) failed: ${msg}`)
      return { rowsStored: ctx.rowsStored, error: msg, pageUrl: page.url() }
    }
  }

  return { rowsStored: ctx.rowsStored, pageUrl: page.url() }
}

async function executeStep(
  page: Page,
  step: ScraperStep,
  steps: ScraperStep[],
  stepIndex: number,
  ctx: ExecutionContext,
  opts: {
    onStoreRow: StoreRowFn
    onStorePdfDocument?: StorePdfDocumentFn
    log: (m: string) => void
    onPause?: (message?: string) => Promise<void>
  }
): Promise<{ nextIndex?: number; skipNested?: boolean; breakLoop?: boolean } | void> {
  const vars = {
    ...ctx.vars,
    ...(ctx.currentOption && {
      current_option_value: ctx.currentOption.value,
      current_option_text: ctx.currentOption.text,
    }),
  }
  const rawStep = step as unknown as Record<string, unknown>
  const stepConfig = (rawStep.config ?? {}) as Record<string, unknown>
  const stepType = rawStep.type as string
  // Backwards compatibility: compiled/LLM flows often put step props at top level (e.g. url, selector)
  if (stepType === "navigate") {
    if (stepConfig.url == null && rawStep.url != null) stepConfig.url = rawStep.url
    if (stepConfig.waitUntil == null && rawStep.waitUntil != null) stepConfig.waitUntil = rawStep.waitUntil
  }
  if (stepType === "click") {
    if (stepConfig.selector == null && rawStep.selector != null) stepConfig.selector = rawStep.selector
    if (stepConfig.scrollIntoView == null && rawStep.scrollIntoView != null) stepConfig.scrollIntoView = rawStep.scrollIntoView
    if (stepConfig.force == null && rawStep.force != null) stepConfig.force = rawStep.force
    if (stepConfig.waitAfter == null && rawStep.waitAfter != null) stepConfig.waitAfter = rawStep.waitAfter
    if (stepConfig.waitForSelector == null && rawStep.waitForSelector != null) stepConfig.waitForSelector = rawStep.waitForSelector
  }
  if (stepType === "form_fill") {
    if (stepConfig.fields == null && rawStep.fields != null) stepConfig.fields = rawStep.fields
    if (stepConfig.submit == null && rawStep.submit != null) stepConfig.submit = rawStep.submit
  }
  if (stepType === "checkbox_group") {
    if (stepConfig.checkboxes == null && rawStep.checkboxes != null) stepConfig.checkboxes = rawStep.checkboxes
  }
  if (stepType === "row_crawler") {
    if (stepConfig.rowSelector == null && rawStep.rowSelector != null) stepConfig.rowSelector = rawStep.rowSelector
    if (stepConfig.capture == null && rawStep.capture != null) stepConfig.capture = rawStep.capture
    if (stepConfig.pagination == null && rawStep.pagination != null) stepConfig.pagination = rawStep.pagination
    if (stepConfig.expand == null && rawStep.expand != null) stepConfig.expand = rawStep.expand
  }
  if (stepType === "for_each_id") {
    if (stepConfig.ids == null && rawStep.ids != null) stepConfig.ids = rawStep.ids
    if (stepConfig.idsVar == null && rawStep.idsVar != null) stepConfig.idsVar = rawStep.idsVar
    if (stepConfig.limit == null && rawStep.limit != null) stepConfig.limit = rawStep.limit
  }
  const cfg = interpolateObject(stepConfig, vars) as Record<string, unknown>

  const scope = ctx.currentRow as Locator | null
  const root = (ctx.currentFrame ?? page) as Page | Frame | FrameLocator

  function loc(selector: string): Locator {
    if (scope) return scope.locator(selector).first()
    return root.locator(selector).first()
  }

  switch (step.type) {
    case "navigate": {
      const url = interpolate(String(cfg.url ?? ""), ctx.vars)
      if (url == null || url === "") throw new Error("navigate step missing url")
      opts.log(`Navigate: ${url}`)
      await page.goto(String(url), {
        waitUntil:
          (cfg.waitUntil as "load" | "domcontentloaded" | "networkidle") ??
          "domcontentloaded",
        timeout: 60000,
      })
      break
    }

    case "pause_for_login": {
      const s = step as PauseForLoginStep
      const msg = s.config.message ?? "Manual login"
      opts.log(msg)
      if (opts.onPause) {
        await opts.onPause(msg)
      } else {
        const secs = s.config.waitSeconds ?? 120
        await page.waitForTimeout(secs * 1000)
      }
      break
    }

    case "switch_frame": {
      const s = step as SwitchFrameStep
      if (s.config.selector) {
        ctx.currentFrame = page.frameLocator(String(cfg.selector))
        opts.log(`Switch to frame: ${cfg.selector}`)
      } else if (s.config.name) {
        const frame = page.frame({ name: String(cfg.name) })
        if (!frame) throw new Error(`Frame not found: name="${cfg.name}"`)
        ctx.currentFrame = frame
        opts.log(`Switch to frame: name="${cfg.name}"`)
      } else if (s.config.url) {
        const urlPat = String(cfg.url)
        const frame = page.frames().find((f) => f.url().includes(urlPat))
        if (!frame) throw new Error(`Frame not found: url contains "${urlPat}"`)
        ctx.currentFrame = frame
        opts.log(`Switch to frame: url contains "${urlPat}"`)
      } else {
        throw new Error("switch_frame requires selector, name, or url")
      }
      break
    }

    case "switch_frame_main": {
      ctx.currentFrame = undefined
      opts.log("Switch to main page")
      break
    }

    case "wait": {
      const s = step as WaitStep
      if (cfg.selector) {
        const target = scope
          ? scope.locator(String(cfg.selector)).first()
          : root.locator(String(cfg.selector)).first()
        await target.waitFor({
          timeout: (cfg.timeout as number) ?? 15000,
          state: (cfg.waitUntil as "visible" | "hidden") ?? "visible",
        })
      } else {
        await page.waitForTimeout((cfg.timeout as number) ?? 2000)
      }
      break
    }

    case "fill_field": {
      const s = step as FillFieldStep
      const value = interpolate(s.config.value, ctx.vars)
      const target = root.locator(String(cfg.selector)).first()
      if (s.config.clearFirst) await target.clear()
      if (s.config.method === "type") {
        await target.fill("")
        await target.type(value, { delay: s.config.typeDelay ?? 50 })
      } else {
        await target.fill(value)
      }
      if (s.config.pressEnter) await target.press("Enter")
      break
    }

    case "date_range": {
      const s = step as DateRangeStep
      const fromVal = interpolate(s.config.fromValue, ctx.vars)
      const toVal = interpolate(s.config.toValue, ctx.vars)
      const r = root as { fill: (sel: string, val: string) => Promise<void> }
      await r.fill(String(cfg.fromSelector), fromVal)
      await r.fill(String(cfg.toSelector), toVal)
      break
    }

    case "select_dropdown": {
      const s = step as SelectDropdownStep
      const value = interpolate(s.config.value, ctx.vars)
      const target = root.locator(String(cfg.selector)).first()
      if (s.config.selectBy === "value") {
        await target.selectOption({ value })
      } else if (s.config.selectBy === "label") {
        await target.selectOption({ label: value })
      } else {
        await target.selectOption({ index: parseInt(value, 10) })
      }
      break
    }

    case "checkbox": {
      const s = step as CheckboxStep
      const target = root.locator(String(cfg.selector)).first()
      const checked = await target.isChecked()
      if (s.config.state === "checked" && !checked) await target.check()
      else if (s.config.state === "unchecked" && checked) await target.uncheck()
      break
    }

    case "click": {
      const selector = cfg.selector != null ? String(cfg.selector) : undefined
      if (selector == null || selector === "" || selector === "undefined") throw new Error("click step missing selector")

      let target: Locator
      const effectiveRoot = (ctx.currentFrame ?? page) as Page | Frame | FrameLocator
      if (ctx.currentFrame !== undefined) {
        target = effectiveRoot.locator(selector).first()
      } else {
        const mainTimeout = 4000
        try {
          await page.locator(selector).first().waitFor({ state: "attached", timeout: mainTimeout })
          target = page.locator(selector).first()
        } catch {
          const frame = await findFrameWithSelector(page, selector, 8000)
          if (frame) {
            ctx.currentFrame = frame
            target = frame.locator(selector).first()
            opts.log(`Switched to iframe (element found): ${frame.url().slice(0, 60)}…`)
          } else {
            throw new Error(`Selector "${selector}" not found in main page or any iframe`)
          }
        }
      }

      if (cfg.scrollIntoView !== false) await target.scrollIntoViewIfNeeded()
      await target.click({ force: cfg.force === true })
      if (cfg.waitAfter) await page.waitForTimeout(Number(cfg.waitAfter))
      const rootForWait = (ctx.currentFrame ?? page) as Page | Frame | FrameLocator
      if (cfg.waitForSelector) {
        await rootForWait.locator(String(cfg.waitForSelector)).first().waitFor({ timeout: 15000 })
      }
      break
    }

    case "for_each_option": {
      const s = step as ForEachOptionStep
      const select = root.locator(String(cfg.selector)).first()
      const optionHandles = await select.locator("option").all()
      const optionCount = optionHandles.length
      const start = s.config.skipFirst ? 1 : 0
      const endIdx = getNestedStepRange(steps, stepIndex, "for_each_option")

      for (let idx = start; idx < optionCount; idx++) {
        const opt = optionHandles[idx]
        const value = await opt.getAttribute("value")
        const text = await opt.textContent()
        ctx.currentOption = { value: value ?? "", text: (text ?? "").trim() }
        if (s.config.outputValueVar)
          ctx.vars[s.config.outputValueVar] = ctx.currentOption.value
        if (s.config.outputTextVar)
          ctx.vars[s.config.outputTextVar] = ctx.currentOption.text

        await select.selectOption({ index: idx })
        await page.waitForTimeout(500)

        for (let j = stepIndex + 1; j < endIdx; j++) {
          ctx.currentRow = null
          const res = await executeStep(page, steps[j], steps, j, ctx, opts)
          if (res?.breakLoop) break
        }
      }
      ctx.currentOption = undefined
      return { nextIndex: endIdx }
    }

    case "for_each_result": {
      const s = step as ForEachResultStep
      const rows = await root.locator(String(cfg.selector)).all()
      const limit =
        s.config.limit && s.config.limit > 0 ? s.config.limit : rows.length
      opts.log(`for_each_result: found ${rows.length} rows (processing ${Math.min(rows.length, limit)})`)
      const endIdx = getNestedStepRange(steps, stepIndex, "for_each_result")

      for (let idx = 0; idx < Math.min(rows.length, limit); idx++) {
        ctx.row = {}
        ctx.currentRow = rows[idx]

        for (let j = stepIndex + 1; j < endIdx; j++) {
          const res = await executeStep(page, steps[j], steps, j, ctx, opts)
          if (res?.breakLoop) break
        }
      }
      ctx.currentRow = null
      return { nextIndex: endIdx }
    }

    case "for_each_id": {
      const s = step as ForEachIdStep
      const rawIds = (cfg.ids as string[] | undefined) ?? (s.config.idsVar ? (ctx.vars[s.config.idsVar] as string[]) : undefined)
      const ids = Array.isArray(rawIds) ? rawIds : []
      const limit = s.config.limit && s.config.limit > 0 ? Math.min(ids.length, s.config.limit) : ids.length
      opts.log(`for_each_id: ${ids.length} ids (processing ${limit})`)
      const endIdx = getNestedStepRange(steps, stepIndex, "for_each_id")

      for (let idx = 0; idx < limit; idx++) {
        const id = ids[idx]
        ctx.vars.current_id = id
        ctx.vars.current_index = idx
        ctx.row = { id, case_number: id }

        for (let j = stepIndex + 1; j < endIdx; j++) {
          const res = await executeStep(page, steps[j], steps, j, ctx, opts)
          if (res?.breakLoop) break
        }
      }
      return { nextIndex: endIdx }
    }

    case "condition_group": {
      const s = step as ConditionGroupStep
      const val = (ctx.row[s.config.fieldId] ?? ctx.vars[s.config.fieldId] ?? "") as string
      const arr = Array.isArray(ctx.row[s.config.fieldId]) ? (ctx.row[s.config.fieldId] as string[]) : null
      const op = s.config.operator
      let pass = false
      if (op === "not_empty") {
        pass = (typeof val === "string" ? val.trim() : arr?.length) ? true : false
      } else if (op === "equals") {
        pass = String(val).trim() === String(s.config.value ?? "").trim()
      } else if (op === "contains") {
        pass = String(val).includes(String(s.config.value ?? ""))
      } else if (op === "matches" && s.config.pattern) {
        pass = new RegExp(s.config.pattern).test(String(val))
      } else if (op === "in" && s.config.values?.length) {
        pass = s.config.values!.includes(String(val).trim())
      }
      if (!pass) {
        opts.log(`  condition_group: skip (${s.config.fieldId} ${op} failed)`)
        return { breakLoop: true }
      }
      opts.log(`  condition_group: pass (${s.config.fieldId})`)
      break
    }

    case "extract_to_memory": {
      const s = step as ExtractToMemoryStep
      const key = s.config.key
      const memoryKey = s.config.memoryKey ?? key
      const condField = s.config.conditionFieldId
      const condVal = s.config.conditionValue
      const src = s.config.source === "vars" ? ctx.vars : ctx.row
      const checkSrc = s.config.source === "vars" ? ctx.vars : ctx.row
      if (condField != null && condField !== "" && condVal !== undefined) {
        const check = String(checkSrc[condField] ?? "").trim()
        if (check !== String(condVal).trim()) break
      }
      const v = src[key]
      if (v != null && v !== "") {
        ctx.memory[memoryKey] = String(v)
        opts.log(`  extract_to_memory: ${memoryKey}=${String(v).slice(0, 40)}`)
      }
      break
    }

    case "store_memory": {
      const s = step as StoreMemoryStep
      const keys = s.config.keys ?? ["state", "county"]
      for (const k of keys) {
        const v = ctx.memory[k]
        if (v != null && v !== "") ctx.row[k] = v
      }
      opts.log(`  store_memory: ${keys.join(", ")} -> row`)
      break
    }

    case "extract_pdf": {
      const s = step as ExtractPdfStep
      let pdfUrl = ""
      if (s.config.fieldId) {
        const u = ctx.row[s.config.fieldId]
        pdfUrl = typeof u === "string" ? u : Array.isArray(u) ? (u[0] ?? "") : ""
      } else if (s.config.selector) {
        const target = loc(String(cfg.selector))
        const count = await target.count()
        if (count > 0) {
          let href = (await target.getAttribute("href")) ?? ""
          if (href && !href.startsWith("http")) href = new URL(href, page.url()).href
          pdfUrl = href
        }
      }
      if (!pdfUrl || !opts.onStorePdfDocument) {
        if (!pdfUrl) opts.log(`  extract_pdf: no URL found`)
        break
      }
      let screenshotBuffer: Buffer | undefined
      let screenshotBuffers: Buffer[] | undefined
      const takeAllPages = s.config.screenshotAllPages === true
      const takeOne = s.config.screenshot === true || takeAllPages
      if (takeOne) {
        try {
          await page.goto(pdfUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
          if (takeAllPages) {
            const maxPages = 100
            const buffers: Buffer[] = []
            let lastLen = 0
            let sameCount = 0
            for (let p = 0; p < maxPages; p++) {
              const buf = await page.screenshot({ type: "png" })
              const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
              buffers.push(b)
              if (b.length === lastLen) {
                sameCount++
                if (sameCount >= 2) break
              } else {
                sameCount = 0
              }
              lastLen = b.length
              if (p < maxPages - 1) {
                await page.keyboard.press("PageDown")
                await page.waitForTimeout(500)
              }
            }
            screenshotBuffers = buffers
            opts.log(`  extract_pdf: ${screenshotBuffers.length} page screenshot(s)`)
          } else {
            const buf = await page.screenshot({ type: "png" })
            screenshotBuffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
          }
        } catch (e) {
          opts.log(`  extract_pdf: screenshot failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      const rowWithGeo = { ...ctx.row, state: ctx.row.state ?? ctx.memory.state, county: ctx.row.county ?? ctx.memory.county }
      await opts.onStorePdfDocument({
        pdfUrl,
        row: rowWithGeo,
        ctx,
        screenshotBuffer,
        screenshotBuffers,
      })
      opts.log(`  extract_pdf: stored ${pdfUrl}`)
      break
    }

    case "extract_field": {
      const s = step as ExtractFieldStep
      const target = loc(String(cfg.selector))
      const count = await target.count()
      if (count === 0 && s.config.required) {
        throw new Error(`Required field ${s.config.fieldId} not found: ${cfg.selector}`)
      }
      if (count > 0) {
        const attr = (s.config.attr ?? "text") as string
        let value: string
        if (attr === "text") {
          value = (await target.textContent()) ?? ""
        } else if (attr === "html") {
          value = (await target.evaluate((el) => (el as HTMLElement).innerHTML)) ?? ""
        } else {
          value = (await target.getAttribute(attr)) ?? ""
        }
        ctx.row[s.config.fieldId] = value.trim()
        const preview = value.length > 60 ? value.slice(0, 60) + "…" : value
        opts.log(`  extract_field ${s.config.fieldId}: ${preview}`)
      }
      break
    }

    case "extract_link": {
      const s = step as ExtractLinkStep
      const target = loc(String(cfg.selector))
      const count = await target.count()
      if (count > 0) {
        let href = (await target.getAttribute("href")) ?? ""
        if (s.config.makeAbsolute && href && !href.startsWith("http")) {
          href = new URL(href, page.url()).href
        }
        ctx.row[s.config.fieldId] = href
      }
      break
    }

    case "extract_pdf_url": {
      const s = step as ExtractPdfUrlStep
      const target = loc(String(cfg.selector))
      const count = await target.count()
      if (count > 0) {
        let href = (await target.getAttribute("href")) ?? ""
        if (s.config.makeAbsolute && href && !href.startsWith("http")) {
          href = new URL(href, page.url()).href
        }
        const fieldId = s.config.fieldId ?? "pdf_urls"
        const arr = (Array.isArray(ctx.row[fieldId]) ? ctx.row[fieldId] : []) as string[]
        if (href) arr.push(href)
        ctx.row[fieldId] = arr
      }
      break
    }

    case "extract_text": {
      const s = step as ExtractTextStep
      const target = s.config.selector ? loc(String(s.config.selector)) : root.locator("body")
      const count = await target.count()
      if (count > 0) {
        const text = (await target.textContent()) ?? ""
        ctx.row[s.config.fieldId] = text.trim()
      }
      break
    }

    case "paginate": {
      const s = step as PaginateStep
      const nextBtn = root.locator(String(cfg.selector)).first()
      const count = await nextBtn.count()
      if (count === 0) break
      const disabled = await nextBtn.isDisabled().catch(() => true)
      if (disabled) break
      const maxPages = s.config.maxPages ?? 50
      if (ctx.pageNum >= maxPages) break
      await nextBtn.click()
      ctx.pageNum++
      if (s.config.waitAfter) await page.waitForTimeout(s.config.waitAfter)
      break
    }

    case "store_row": {
      const s = step as StoreRowStep
      if (Object.keys(ctx.row).length === 0) break
      const merged = { ...ctx.memory, ...ctx.row }
      let row = { ...merged }
      if (s.config.columnMap && Object.keys(s.config.columnMap).length > 0) {
        const mapped: Record<string, unknown> = {}
        for (const [key, val] of Object.entries(row)) {
          const col = s.config.columnMap![key] ?? key
          mapped[col] = val
        }
        row = mapped
      }
      const data: Record<string, unknown> = {
        ...row,
        job_id: ctx.jobId,
        scraped_at: new Date().toISOString(),
        source_url: page.url(),
      }
      if (s.config.sourceSite) data.source_site = s.config.sourceSite
      if (s.config.flowId) data.flow_id = s.config.flowId
      const keys = Object.keys(data).filter((k) => !["job_id", "scraped_at"].includes(k))
      opts.log(`store_row: saving ${keys.join(", ")}`)
      await opts.onStoreRow(data, ctx)
      ctx.rowsStored++
      ctx.row = {}
      break
    }

    case "delay": {
      const s = step as DelayStep
      await page.waitForTimeout(s.config.ms)
      break
    }

    case "form_fill": {
      const fields = (cfg.fields ?? []) as Array<{ selector?: string; value?: string; name?: string }>
      for (const f of fields) {
        const sel = f.selector ?? (f.name ? `[name="${f.name}"]` : null)
        if (!sel) continue
        const value = interpolate(f.value ?? "", ctx.vars)
        const target = root.locator(sel).first()
        await target.fill(String(value))
        opts.log(`  form_fill: ${sel} = ${String(value).slice(0, 40)}`)
      }
      const submitSel = cfg.submit != null ? String(cfg.submit) : null
      if (submitSel) {
        await root.locator(submitSel).first().click()
        opts.log(`  form_fill: submit ${submitSel}`)
      }
      break
    }

    case "checkbox_group": {
      const checkboxes = (cfg.checkboxes ?? []) as Array<{ selector?: string; checked?: boolean }>
      for (const c of checkboxes) {
        if (!c.selector) continue
        const target = root.locator(c.selector).first()
        const checked = (c.checked ?? true) as boolean
        if (checked) await target.check().catch(() => target.click())
        else await target.uncheck().catch(() => target.click())
        opts.log(`  checkbox_group: ${c.selector} = ${checked}`)
      }
      break
    }

    case "row_crawler": {
      const rowSelector = cfg.rowSelector != null ? String(cfg.rowSelector) : null
      if (!rowSelector) throw new Error("row_crawler missing rowSelector")
      const captureList = (cfg.capture ?? []) as Array<{ field: string; selector?: string; attr?: string }>
      const paginationCfg = cfg.pagination as { selector?: string; maxPages?: number } | undefined
      const maxPages = paginationCfg?.maxPages ?? 50
      let pageNum = 0
      let totalStored = 0

      const processPage = async (): Promise<boolean> => {
        const rows = await root.locator(rowSelector).all()
        opts.log(`row_crawler: page ${pageNum + 1}, ${rows.length} rows`)
        for (const rowLoc of rows) {
          ctx.row = {}
          ctx.currentRow = rowLoc as unknown as Locator
          for (const cap of captureList) {
            const sel = cap.selector ?? `td`
            const attr = (cap.attr ?? "text") as string
            const cell = rowLoc.locator(sel).first()
            const count = await cell.count()
            if (count > 0) {
              let value: string
              if (attr === "text") value = (await cell.textContent()) ?? ""
              else if (attr === "html") value = (await cell.evaluate((el) => (el as HTMLElement).innerHTML)) ?? ""
              else value = (await cell.getAttribute(attr)) ?? ""
              ctx.row[cap.field] = (value ?? "").trim()
            }
          }
          if (Object.keys(ctx.row).length > 0) {
            const merged = { ...ctx.memory, ...ctx.row }
            await opts.onStoreRow(merged as Record<string, unknown>, ctx)
            totalStored++
          }
        }
        ctx.currentRow = null

        const nextSel = paginationCfg?.selector
        if (!nextSel || pageNum >= maxPages - 1) return false
        const nextBtn = root.locator(nextSel).first()
        const count = await nextBtn.count()
        if (count === 0) return false
        const disabled = await nextBtn.isDisabled().catch(() => true)
        if (disabled) return false
        await nextBtn.click()
        pageNum++
        await page.waitForTimeout(500)
        return true
      }

      let hasMore = true
      while (hasMore) {
        hasMore = await processPage()
      }
      opts.log(`row_crawler done: ${totalStored} rows stored`)
      break
    }

    default:
      opts.log(`Unknown step type: ${(step as { type: string }).type}`)
  }

  return undefined
}
