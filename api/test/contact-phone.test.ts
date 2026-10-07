import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { plainToInstance } from "class-transformer"
import { validateSync } from "class-validator"

import { VenueSetupDto } from "../src/features/venues/venues.dto.js"
import { normalizeVnPhone } from "../src/shared/helpers.js"

void test("normalizeVnPhone accepts common Vietnamese formats", () => {
  assert.equal(normalizeVnPhone("0912345678"), "0912345678")
  assert.equal(normalizeVnPhone("0912 345 678"), "0912345678")
  assert.equal(normalizeVnPhone("0912.345.678"), "0912345678")
  assert.equal(normalizeVnPhone("+84 912 345 678"), "0912345678")
  assert.equal(normalizeVnPhone("84912345678"), "0912345678")
  // 11-digit landline (e.g. Hà Nội 024).
  assert.equal(normalizeVnPhone("(024) 3825 1234"), "02438251234")
})

void test("normalizeVnPhone rejects non-numbers and wrong lengths", () => {
  for (const raw of ["", "abc", "091234567", "091234567890", "912345678"]) {
    assert.equal(normalizeVnPhone(raw), null, raw)
  }
})

function validateSetup(contactPhone: unknown) {
  const dto = plainToInstance(VenueSetupDto, {
    brandName: "Hệ thống Sân ABC",
    managerName: "Nguyễn Văn A",
    contactPhone,
    branches: [
      {
        name: "Chi nhánh 1",
        ward: "Phường Tân Thuận",
        province: "Thành phố Hồ Chí Minh",
        sports: ["badminton"],
        openFrom: "06:00",
        openTo: "22:00",
      },
    ],
  })
  return { dto, errors: validateSync(dto) }
}

void test("VenueSetupDto normalizes a valid contact phone", () => {
  const { dto, errors } = validateSetup("+84 912 345 678")
  assert.deepEqual(errors, [])
  assert.equal(dto.contactPhone, "0912345678")
})

void test("VenueSetupDto rejects an invalid contact phone", () => {
  const { errors } = validateSetup("12345")
  assert.deepEqual(
    errors.map((e) => e.property),
    ["contactPhone"]
  )
})

void test("VenueSetupDto leaves contact phone optional (add-branch)", () => {
  const { errors } = validateSetup(undefined)
  assert.deepEqual(errors, [])
})
