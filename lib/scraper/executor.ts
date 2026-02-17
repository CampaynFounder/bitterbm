/**
 * Playwright-based scraper flow executor
 * Runs JSON-defined steps against a browser page
 */
import type { Page, Locator } from "playwright"
import { interpolate, interpolateObject } from "./interpolate"
import type {
  ScraperFlow,
  ScraperStep,
  ExecutionContext,
  NavigateStep,
  WaitStep,
  FillFieldStep,
  DateRangeStep,
  SelectDropdownStep,
  CheckboxStep,
  ClickStep,
  ForEachOptionStep,
  ForEachResultStep,
  ExtractFieldStep,
  ExtractLinkStep,
  PaginateStep,
  StoreRowStep,
  DelayStep,
} from "./types"

const RESULT_NESTED_TYPES = new Set(["extract_field", "extract_link", "store_row"])

function getNestedStepRange(
  steps: ScraperStep[],
  startIndex: number,
  loopType: "for_each_result" | "for_each_option"
): number {
  let j = startIndex + 1
  if (loopType === "for_each_result") {
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

export type StoreRowFn = (row: Record<string, unknown>, ctx: ExecutionContext) => Promise<void>

export interface ExecutorOptions {
  flow: ScraperFlow
  vars: Record<string, string | number>
  jobId: string
  flowId?: string
  sourceSite?: string
  onStoreRow: StoreRowFn
  onLog?: (msg: string) => void
}

export async function executeFlow(
  page: Page,
  options: ExecutorOptions
): Promise<{ rowsStored: number; error?: string }> {
  const { flow, vars, jobId, flowId, sourceSite, onStoreRow, onLog } = options
  const log = onLog ?? (() => {})

  const ctx: ExecutionContext = {
    vars: { ...vars, job_id: jobId },
    row: {},
    currentRow: null,
    rowsStored: 0,
    pageNum: 1,
    jobId,
    flowId,
    sourceSite,
  }

  const steps = flow.steps
  let i = 0

  while (i < steps.length) {
    const step = steps[i]
    try {
      const result = await executeStep(
        page,
        step,
        steps,
        i,
        ctx,
        { onStoreRow, log }
      )
      if (result?.nextIndex !== undefined) {
        i = result.nextIndex
      } else {
        i++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Step ${i + 1} (${step.type}) failed: ${msg}`)
      return { rowsStored: ctx.rowsStored, error: msg }
    }
  }

  return { rowsStored: ctx.rowsStored }
}

async function executeStep(
  page: Page,
  step: ScraperStep,
  steps: ScraperStep[],
  stepIndex: number,
  ctx: ExecutionContext,
  opts: { onStoreRow: StoreRowFn; log: (m: string) => void }
): Promise<{ nextIndex?: number } | void> {
  const vars = {
    ...ctx.vars,
    ...(ctx.currentOption && {
      current_option_value: ctx.currentOption.value,
      current_option_text: ctx.currentOption.text,
    }),
  }
  const cfg = interpolateObject(
    (step as { config?: Record<string, unknown> }).config ?? {},
    vars
  ) as Record<string, unknown>

  const scope = ctx.currentRow as Locator | null

  function loc(selector: string): Locator {
    return scope ? scope.locator(selector).first() : page.locator(selector).first()
  }

  switch (step.type) {
    case "navigate": {
      const s = step as NavigateStep
      const url = interpolate(s.config.url, ctx.vars)
      opts.log(`Navigate: ${url}`)
      await page.goto(url, {
        waitUntil:
          (s.config.waitUntil as "load" | "domcontentloaded" | "networkidle") ??
          "domcontentloaded",
        timeout: 60000,
      })
      break
    }

    case "wait": {
      const s = step as WaitStep
      if (cfg.selector) {
        const target = scope
          ? scope.locator(String(cfg.selector)).first()
          : page.locator(String(cfg.selector)).first()
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
      const target = page.locator(String(cfg.selector)).first()
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
      await page.fill(String(cfg.fromSelector), fromVal)
      await page.fill(String(cfg.toSelector), toVal)
      break
    }

    case "select_dropdown": {
      const s = step as SelectDropdownStep
      const value = interpolate(s.config.value, ctx.vars)
      const target = page.locator(String(cfg.selector)).first()
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
      const target = page.locator(String(cfg.selector)).first()
      const checked = await target.isChecked()
      if (s.config.state === "checked" && !checked) await target.check()
      else if (s.config.state === "unchecked" && checked) await target.uncheck()
      break
    }

    case "click": {
      const s = step as ClickStep
      const target = page.locator(String(cfg.selector)).first()
      if (s.config.scrollIntoView !== false) await target.scrollIntoViewIfNeeded()
      await target.click()
      if (s.config.waitAfter) await page.waitForTimeout(s.config.waitAfter)
      if (s.config.waitForSelector) {
        await page.waitForSelector(s.config.waitForSelector, { timeout: 15000 })
      }
      break
    }

    case "for_each_option": {
      const s = step as ForEachOptionStep
      const select = page.locator(String(cfg.selector)).first()
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
          await executeStep(page, steps[j], steps, j, ctx, opts)
        }
      }
      ctx.currentOption = undefined
      return { nextIndex: endIdx }
    }

    case "for_each_result": {
      const s = step as ForEachResultStep
      const rows = await page.locator(String(cfg.selector)).all()
      const limit =
        s.config.limit && s.config.limit > 0 ? s.config.limit : rows.length
      const endIdx = getNestedStepRange(steps, stepIndex, "for_each_result")

      for (let idx = 0; idx < Math.min(rows.length, limit); idx++) {
        ctx.row = {}
        ctx.currentRow = rows[idx]

        for (let j = stepIndex + 1; j < endIdx; j++) {
          await executeStep(page, steps[j], steps, j, ctx, opts)
        }
      }
      ctx.currentRow = null
      return { nextIndex: endIdx }
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

    case "paginate": {
      const s = step as PaginateStep
      const nextBtn = page.locator(String(cfg.selector)).first()
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
      const data: Record<string, unknown> = {
        ...ctx.row,
        job_id: ctx.jobId,
        scraped_at: new Date().toISOString(),
        source_url: page.url(),
      }
      if (s.config.sourceSite) data.source_site = s.config.sourceSite
      if (s.config.flowId) data.flow_id = s.config.flowId
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

    default:
      opts.log(`Unknown step type: ${(step as { type: string }).type}`)
  }

  return undefined
}
