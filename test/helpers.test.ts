// Small pure helpers the API routes and the participants page rely on.
import { describe, expect, it } from "vitest"
import { parsePositiveInt } from "@/lib/query-params"
import { sanitizeObject, sanitizeString } from "@/lib/sanitize"
import { ENTRY_STATUS_LABELS, entryStatusOf } from "@/lib/entry-type"

describe("parsePositiveInt", () => {
  it.each<[string | null | undefined, number]>([
    [null, 10],
    [undefined, 10],
    ["", 10],
    ["abc", 10],
    ["NaN", 10],
    ["5", 5],
    [" 7", 7],
    ["12abc", 12],
    ["3.9", 3],
    ["1e3", 1],
    ["0", 1],
    ["-3", 1],
    ["50", 50],
    ["51", 50],
    ["999999999999", 50],
  ])("%j -> %i (fallback 10, max 50)", (value, expected) => {
    expect(parsePositiveInt(value, 10, 50)).toBe(expected)
  })
})

describe("sanitizeString", () => {
  it.each([
    ["  plain text  ", "plain text"],
    ["<b>bold</b> move", "bold move"],
    ['<script>alert("x")</script>Hi', 'alert("x")Hi'],
    ['<img src="x" onerror="alert(1)">Gallery', "Gallery"],
    ["5 > 3", "5 > 3"],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(sanitizeString(input)).toBe(expected)
  })

  // Current behaviour, not a goal: plain text with a "<" before a ">" loses
  // everything between them, e.g. in an event description.
  it("drops text between a < and a later >", () => {
    expect(sanitizeString("ages < 12 and > 5")).toBe("ages  5")
  })
})

describe("sanitizeObject", () => {
  it("cleans top-level strings and leaves every other value alone", () => {
    const nested = { note: "<i>kept as is</i>" }
    const input = { name: " <b>Asha</b> ", age: 30, active: true, email: null, nested, tags: ["<b>x</b>"] }
    const output = sanitizeObject(input)
    expect(output).toEqual({ name: "Asha", age: 30, active: true, email: null, nested, tags: ["<b>x</b>"] })
    expect(output.nested).toBe(nested)
    expect(input.name).toBe(" <b>Asha</b> ")
  })
})

describe("entryStatusOf", () => {
  const booking = { entryType: null, amountPaid: true, paymentId: null, paymentOrderId: null }

  it.each([
    ["unsettled, whatever the type", { ...booking, amountPaid: false, entryType: "PAID" as const }, false, "UNPAID"],
    ["unsettled free booking", { ...booking, amountPaid: false }, true, "UNPAID"],
    ["recorded type wins", { ...booking, entryType: "COMPLIMENTARY" as const, paymentId: "pay_1" }, false, "COMPLIMENTARY"],
    ["recorded FREE", { ...booking, entryType: "FREE" as const }, true, "FREE"],
    ["legacy with a Razorpay payment", { ...booking, paymentId: "pay_1" }, true, "PAID"],
    ["legacy with a Razorpay order", { ...booking, paymentOrderId: "order_1" }, false, "PAID"],
    ["legacy on a free event", booking, true, "FREE"],
    ["legacy manual tick on a paid event", booking, false, "PAID"],
  ])("%s", (_name, participant, eventIsFree, expected) => {
    expect(entryStatusOf(participant, eventIsFree)).toBe(expected)
  })

  it("has a label for every status", () => {
    expect(Object.keys(ENTRY_STATUS_LABELS).sort()).toEqual(["COMPLIMENTARY", "FREE", "PAID", "UNPAID"])
  })
})
