import { createElement, useState } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { useAdminPagination } from "./pagination"

type Step = { total: number; page?: number; size?: number }

function runSteps(steps: Step[]) {
  let result: ReturnType<typeof useAdminPagination>
  function Probe() {
    const [index, setIndex] = useState(0)
    const step = steps[index]
    const pagination = useAdminPagination(step.total)
    result = pagination
    if (index < steps.length - 1) {
      if (step.page !== undefined) pagination.setPage(step.page)
      if (step.size !== undefined) pagination.setPageSize(step.size)
      setIndex(index + 1)
    }
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return result!
}

describe("admin pagination", () => {
  it("handles empty lists and exact page boundaries", () => {
    expect(runSteps([{ total: 0 }])).toMatchObject({
      page: 1,
      pageCount: 1,
      offset: 0,
    })
    expect(runSteps([{ total: 20 }])).toMatchObject({
      pageCount: 2,
      pageSize: 10,
    })
  })

  it("reaches a partial last page without repeating or skipping rows", () => {
    const items = Array.from({ length: 23 }, (_, i) => i)
    const pages = [1, 2, 3].flatMap((page) => {
      const p = runSteps([{ total: 23, page }, { total: 23 }])
      return items.slice(p.offset, p.offset + p.pageSize)
    })
    expect(pages).toEqual(items)
  })

  it("clamps the page after deletion or approval and keeps it after new items arrive", () => {
    const p = runSteps([{ total: 21, page: 3 }, { total: 20 }, { total: 21 }])
    expect(p).toMatchObject({ page: 2, offset: 10 })
    expect(runSteps([{ total: 21, page: 3 }, { total: 0 }])).toMatchObject({
      page: 1,
      offset: 0,
    })
  })

  it("returns to the first page when changing the page size", () => {
    const p = runSteps([
      { total: 51, page: 6 },
      { total: 51, size: 20 },
      { total: 51 },
    ])
    expect(p).toMatchObject({ page: 1, pageSize: 20, pageCount: 3, offset: 0 })
  })
})
