import { describe, it, expect } from "vitest";
import {
  MALDIVES_ATOLLS,
  MALDIVES_ISLANDS,
  getAtollByCode,
  getIslandById,
  searchMaldivesLocations,
  validateMedBusinessRegistration,
  isMaldivesWorkingDay,
  validateShiftSchedule,
} from "./maldivesOperationalDefaults";

describe("SERP-326: Maldives Geographic Directory & Atoll Master", () => {
  it("contains exactly 20 administrative atolls", () => {
    expect(MALDIVES_ATOLLS.length).toBe(20);
    const codes = new Set(MALDIVES_ATOLLS.map((a) => a.code));
    expect(codes.size).toBe(20);
    expect(codes.has("K")).toBe(true);
    expect(codes.has("HA")).toBe(true);
    expect(codes.has("HDh")).toBe(true);
    expect(codes.has("S")).toBe(true);
    expect(codes.has("Gn")).toBe(true);
  });

  it("contains authoritative inhabited islands and industrial zones", () => {
    expect(MALDIVES_ISLANDS.length).toBeGreaterThanOrEqual(187);
    const male = getIslandById("male");
    expect(male).toBeDefined();
    expect(male?.nameEn).toBe("Malé");
    expect(male?.nameDv).toBe("މާލެ");
    expect(male?.isCity).toBe(true);
    expect(male?.atollCode).toBe("K");

    const fuvahmulah = getIslandById("fuvahmulah");
    expect(fuvahmulah?.isCity).toBe(true);
    expect(fuvahmulah?.atollCode).toBe("Gn");

    const thilafushi = getIslandById("thilafushi");
    expect(thilafushi).toBeDefined();
    expect(thilafushi?.isIndustrial).toBe(true);

    const gulhifalhu = getIslandById("gulhifalhu");
    expect(gulhifalhu?.isIndustrial).toBe(true);
  });

  it("resolves atolls by code case-insensitively", () => {
    const k = getAtollByCode("k");
    expect(k?.nameEn).toBe("Kaafu");
    expect(k?.administrativeName).toBe("Malé Atoll");
    const s = getAtollByCode("S");
    expect(s?.nameEn).toBe("Seenu / Addu");
  });

  it("auto-completes addresses by English island name", () => {
    const results = searchMaldivesLocations("hulhumale");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].island.nameEn).toBe("Hulhumalé");
    expect(results[0].formattedAddressEn).toContain("Kaafu");
  });

  it("auto-completes addresses by Thaana script name", () => {
    const results = searchMaldivesLocations("ކުޅުދުއްފުށި");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].island.nameEn).toBe("Kulhudhuffushi");
    expect(results[0].atoll.code).toBe("HDh");
    expect(results[0].formattedAddressDv).toContain("ހދ");
  });
});

describe("SERP-326: Ministry of Economic Development (MED) Registration Validation", () => {
  it("accepts valid Company registrations (C-XXXX/YYYY)", () => {
    const res = validateMedBusinessRegistration("C-1234/2021");
    expect(res.isValid).toBe(true);
    expect(res.type).toBe("COMPANY");
    expect(res.registrationYear).toBe(2021);
    expect(res.sequenceNumber).toBe(1234);
    expect(res.normalized).toBe("C-1234/2021");
  });

  it("accepts valid Sole Proprietorship registrations (SP/XXXX/YYYY or SP-XXXX/YYYY)", () => {
    const res1 = validateMedBusinessRegistration("SP-0452/2018");
    expect(res1.isValid).toBe(true);
    expect(res1.type).toBe("SOLE_PROPRIETORSHIP");
    expect(res1.normalized).toBe("SP-0452/2018");

    const res2 = validateMedBusinessRegistration("sp/99/2022");
    expect(res2.isValid).toBe(true);
    expect(res2.type).toBe("SOLE_PROPRIETORSHIP");
    expect(res2.normalized).toBe("SP-0099/2022");
  });

  it("accepts Partnerships (P), Cooperatives (CS), and Foreign Investments (FC)", () => {
    expect(validateMedBusinessRegistration("P-0012/2020").type).toBe("PARTNERSHIP");
    expect(validateMedBusinessRegistration("CS-0005/2019").type).toBe("COOPERATIVE");
    expect(validateMedBusinessRegistration("FC-0100/2023").type).toBe("FOREIGN_INVESTMENT");
  });

  it("rejects invalid prefixes or formats", () => {
    const res1 = validateMedBusinessRegistration("XYZ-1234/2021");
    expect(res1.isValid).toBe(false);
    expect(res1.error).toContain("Invalid MED registration format");
    const res2 = validateMedBusinessRegistration("C12342021");
    expect(res2.isValid).toBe(false);
    const res3 = validateMedBusinessRegistration("");
    expect(res3.isValid).toBe(false);
  });

  it("rejects invalid registration years", () => {
    const resPast = validateMedBusinessRegistration("C-1234/1920");
    expect(resPast.isValid).toBe(false);
    expect(resPast.error).toContain("Invalid registration year");
    const resFuture = validateMedBusinessRegistration("C-1234/2099");
    expect(resFuture.isValid).toBe(false);
    expect(resFuture.error).toContain("Invalid registration year");
  });
});

describe("SERP-326: Maldives Operating Schedules & Friday Prayer Pauses", () => {
  it("correctly identifies Maldives working days (Sunday - Thursday)", () => {
    const sunday = new Date("2026-09-06T10:00:00Z");
    expect(isMaldivesWorkingDay(sunday)).toBe(true);
    const monday = new Date("2026-09-07T10:00:00Z");
    expect(isMaldivesWorkingDay(monday)).toBe(true);
    const thursday = new Date("2026-09-10T10:00:00Z");
    expect(isMaldivesWorkingDay(thursday)).toBe(true);
    const friday = new Date("2026-09-11T10:00:00Z");
    expect(isMaldivesWorkingDay(friday)).toBe(false);
    const saturday = new Date("2026-09-12T10:00:00Z");
    expect(isMaldivesWorkingDay(saturday)).toBe(false);
  });

  it("validates a standard weekday shift without warnings", () => {
    const monday = new Date("2026-09-07T08:00:00Z");
    const shift = { startHour: 8, startMinute: 30, endHour: 16, endMinute: 30 };
    const res = validateShiftSchedule(monday, shift);
    expect(res.isOperatingDay).toBe(true);
    expect(res.isWeekend).toBe(false);
    expect(res.overlapsFridayPrayer).toBe(false);
    expect(res.operatingMinutes).toBe(480);
    expect(res.mandatoryPauseMinutes).toBe(0);
    expect(res.effectiveWorkingMinutes).toBe(480);
    expect(res.warnings.length).toBe(0);
  });

  it("validates Friday shift and calculates mandatory prayer suspension deduction", () => {
    const friday = new Date("2026-09-11T08:00:00Z");
    const shift = { startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 };
    const res = validateShiftSchedule(friday, shift);
    expect(res.isOperatingDay).toBe(false);
    expect(res.isWeekend).toBe(true);
    expect(res.overlapsFridayPrayer).toBe(true);
    expect(res.mandatoryPauseMinutes).toBe(120);
    expect(res.operatingMinutes).toBe(480);
    expect(res.effectiveWorkingMinutes).toBe(360);
    expect(res.warnings.some((w) => w.includes("prayer"))).toBe(true);
  });

  it("handles partial overlap with Friday prayer window", () => {
    const friday = new Date("2026-09-11T08:00:00Z");
    const shift = { startHour: 8, startMinute: 0, endHour: 12, endMinute: 0 };
    const res = validateShiftSchedule(friday, shift);
    expect(res.overlapsFridayPrayer).toBe(true);
    expect(res.mandatoryPauseMinutes).toBe(30);
    expect(res.effectiveWorkingMinutes).toBe(210);
  });
});