/**
 * Maldives Operational Defaults, Geographic Directory & MED Registration Engine (SERP-326)
 *
 * Implements:
 * 1. Authoritative Maldives Geographic Directory (20 administrative atolls, 187 inhabited islands + industrial zones).
 * 2. Search and auto-complete for customer / vendor addresses with atoll and island resolution.
 * 3. Ministry of Economic Development (MED) Business Registration Number validation.
 * 4. Local operational defaults:
 *    - Standard Maldives working week (Sunday - Thursday work days, Friday & Saturday weekend).
 *    - Friday prayer retail suspension window (mandatory ~11:30 - 13:30 MVT pause).
 *    - Operating schedule shift verification and prayer-time pause calculations.
 */

import rawDirectory from "./maldivesDirectoryData.json";

export interface AtollInfo {
  code: string;
  nameEn: string;
  nameDv: string;
  administrativeName: string;
}

export interface IslandInfo {
  id: string;
  nameEn: string;
  nameDv: string;
  atollCode: string;
  isCity: boolean;
  airport: boolean;
  isIndustrial: boolean;
  population: number;
}

export interface ResolvedAddress {
  island: IslandInfo;
  atoll: AtollInfo;
  formattedAddressEn: string;
  formattedAddressDv: string;
}

export interface MedBusinessRegistration {
  raw: string;
  normalized: string;
  type: "SOLE_PROPRIETORSHIP" | "COMPANY" | "PARTNERSHIP" | "COOPERATIVE" | "FOREIGN_INVESTMENT";
  registrationYear?: number;
  sequenceNumber?: number;
  isValid: boolean;
  error?: string;
}

export interface ShiftTimeSlot {
  startHour: number; // 0-23
  startMinute: number; // 0-59
  endHour: number; // 0-23
  endMinute: number; // 0-59
}

export interface ShiftScheduleValidation {
  isOperatingDay: boolean;
  isWeekend: boolean;
  overlapsFridayPrayer: boolean;
  operatingMinutes: number;
  mandatoryPauseMinutes: number;
  effectiveWorkingMinutes: number;
  warnings: string[];
}

export const MALDIVES_ATOLLS: AtollInfo[] = rawDirectory.atolls;
export const MALDIVES_ISLANDS: IslandInfo[] = rawDirectory.islands;

// Quick lookup maps
const ATOLL_MAP = new Map<string, AtollInfo>();
for (const a of MALDIVES_ATOLLS) {
  ATOLL_MAP.set(a.code.toUpperCase(), a);
}

const ISLAND_MAP = new Map<string, IslandInfo>();
for (const i of MALDIVES_ISLANDS) {
  ISLAND_MAP.set(i.id.toLowerCase(), i);
}

/**
 * Standard Maldives Business Week Days (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * In Maldives, Sunday through Thursday are standard business/government days.
 * Friday and Saturday constitute the weekend.
 */
export const MALDIVES_WORKING_DAYS = [0, 1, 2, 3, 4] as const; // Sun, Mon, Tue, Wed, Thu
export const MALDIVES_WEEKEND_DAYS = [5, 6] as const; // Fri, Sat

/**
 * Standard Friday Congregational Prayer Suspension Window in MVT (UTC+5)
 * Retail stores, government offices, and industrial hubs observe statutory closure.
 * Typically 11:30 AM to 13:30 PM (1:30 PM).
 */
export const FRIDAY_PRAYER_WINDOW: ShiftTimeSlot = {
  startHour: 11,
  startMinute: 30,
  endHour: 13,
  endMinute: 30,
};

/**
 * Resolves an atoll by its code (e.g. "K", "HDh", "S").
 */
export function getAtollByCode(code: string): AtollInfo | undefined {
  if (!code) return undefined;
  return ATOLL_MAP.get(code.trim().toUpperCase());
}

/**
 * Resolves an island by ID (e.g. "male", "kulhudhuffushi", "thilafushi").
 */
export function getIslandById(id: string): IslandInfo | undefined {
  if (!id) return undefined;
  return ISLAND_MAP.get(id.trim().toLowerCase());
}

/**
 * Auto-completes or searches islands and atolls by partial text in English or Thaana.
 */
function normalizeSearchText(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function searchMaldivesLocations(query: string, limit = 10): ResolvedAddress[] {
  if (!query || query.trim().length === 0) return [];
  const qRaw = query.trim().toLowerCase();
  const qNorm = normalizeSearchText(query);

  const matches: ResolvedAddress[] = [];

  for (const island of MALDIVES_ISLANDS) {
    const atoll = ATOLL_MAP.get(island.atollCode.toUpperCase());
    if (!atoll) continue;

    const matchesNameEn = island.nameEn.toLowerCase().includes(qRaw) || normalizeSearchText(island.nameEn).includes(qNorm);
    const matchesNameDv = island.nameDv.includes(qRaw);
    const matchesAtollEn = atoll.nameEn.toLowerCase().includes(qRaw) || normalizeSearchText(atoll.nameEn).includes(qNorm);
    const matchesAtollCode = atoll.code.toLowerCase() === qRaw;
    const matchesAdminName = atoll.administrativeName.toLowerCase().includes(qRaw) || normalizeSearchText(atoll.administrativeName).includes(qNorm);

    if (matchesNameEn || matchesNameDv || matchesAtollEn || matchesAtollCode || matchesAdminName) {
      matches.push({
        island,
        atoll,
        formattedAddressEn: `${island.nameEn}, ${atoll.nameEn} (${atoll.code})`,
        formattedAddressDv: `${island.nameDv}، ${atoll.nameDv}`,
      });
      if (matches.length >= limit) break;
    }
  }

  return matches;
}

/**
 * Validates a Ministry of Economic Development (MED) Business Registration Number.
 *
 * Recognized Authoritative Formats:
 * 1. Sole Proprietorship (SP):
 *    Format: SP-XXXX/YYYY or SP/XXXX/YYYY (e.g. "SP-1234/2021", "SP/0452/2018")
 * 2. Company (C):
 *    Format: C-XXXX/YYYY or C/XXXX/YYYY (e.g. "C-0123/2015", "C-1045/2023")
 * 3. Partnership (P):
 *    Format: P-XXXX/YYYY or P/XXXX/YYYY (e.g. "P-0012/2020")
 * 4. Cooperative Society (CS):
 *    Format: CS-XXXX/YYYY or CS/XXXX/YYYY
 * 5. Foreign Investment (FC):
 *    Format: FC-XXXX/YYYY or FC/XXXX/YYYY
 */
export function validateMedBusinessRegistration(input: string): MedBusinessRegistration {
  if (!input || typeof input !== "string") {
    return {
      raw: input || "",
      normalized: "",
      type: "COMPANY",
      isValid: false,
      error: "Registration number is required",
    };
  }

  const raw = input.trim();
  const normalized = raw.toUpperCase().replace(/\s+/g, "");

  const regex = /^(SP|C|P|CS|FC)[-\/](\d{1,6})\/(\d{4})$/;
  const match = normalized.match(regex);

  if (!match) {
    return {
      raw,
      normalized,
      type: "COMPANY",
      isValid: false,
      error: "Invalid MED registration format. Expected format like C-1234/2021, SP-0567/2020, or P-0012/2019.",
    };
  }

  const prefix = match[1];
  const seqNum = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  const currentYear = new Date().getFullYear();
  if (year < 1960 || year > currentYear + 1) {
    return {
      raw,
      normalized,
      type: "COMPANY",
      isValid: false,
      error: `Invalid registration year ${year}. Must be between 1960 and ${currentYear + 1}.`,
    };
  }

  let type: MedBusinessRegistration["type"] = "COMPANY";
  switch (prefix) {
    case "SP":
      type = "SOLE_PROPRIETORSHIP";
      break;
    case "C":
      type = "COMPANY";
      break;
    case "P":
      type = "PARTNERSHIP";
      break;
    case "CS":
      type = "COOPERATIVE";
      break;
    case "FC":
      type = "FOREIGN_INVESTMENT";
      break;
  }

  return {
    raw,
    normalized: `${prefix}-${match[2].padStart(4, "0")}/${year}`,
    type,
    registrationYear: year,
    sequenceNumber: seqNum,
    isValid: true,
  };
}

/**
 * Determines whether a given Date is a standard Maldives business operating day.
 * Sunday (0) through Thursday (4) are working days; Friday (5) and Saturday (6) are weekends.
 */
export function isMaldivesWorkingDay(date: Date): boolean {
  const day = date.getDay();
  return (MALDIVES_WORKING_DAYS as readonly number[]).includes(day);
}

/**
 * Validates a work shift against Maldives operational rules:
 * - Checks if the shift is scheduled on a weekend (Friday or Saturday).
 * - Checks if Friday shift intersects the statutory prayer pause (11:30 - 13:30 MVT).
 * - Computes statutory pause minutes and net effective working minutes.
 */
export function validateShiftSchedule(
  date: Date,
  shift: ShiftTimeSlot
): ShiftScheduleValidation {
  const day = date.getDay();
  const isWeekend = day === 5 || day === 6;
  const isOperatingDay = !isWeekend;
  const warnings: string[] = [];

  const shiftStart = shift.startHour * 60 + shift.startMinute;
  const shiftEnd = shift.endHour * 60 + shift.endMinute;

  let operatingMinutes = 0;
  if (shiftEnd > shiftStart) {
    operatingMinutes = shiftEnd - shiftStart;
  } else if (shiftEnd < shiftStart) {
    // Overnight shift crossing midnight
    operatingMinutes = 24 * 60 - shiftStart + shiftEnd;
  }

  let overlapsFridayPrayer = false;
  let mandatoryPauseMinutes = 0;

  if (day === 5) {
    // Friday
    warnings.push("Shift scheduled on Friday (statutory Maldives weekend / religious observance day).");
    const prayerStart = FRIDAY_PRAYER_WINDOW.startHour * 60 + FRIDAY_PRAYER_WINDOW.startMinute; // 690 min (11:30)
    const prayerEnd = FRIDAY_PRAYER_WINDOW.endHour * 60 + FRIDAY_PRAYER_WINDOW.endMinute; // 810 min (13:30)

    // Calculate overlap
    const overlapStart = Math.max(shiftStart, prayerStart);
    const overlapEnd = Math.min(shiftEnd, prayerEnd);

    if (overlapEnd > overlapStart) {
      overlapsFridayPrayer = true;
      mandatoryPauseMinutes = overlapEnd - overlapStart;
      warnings.push(
        `Shift overlaps Friday congregational prayer window (11:30 - 13:30). Mandatory commercial pause of ${mandatoryPauseMinutes} minutes deducted.`
      );
    }
  } else if (day === 6) {
    warnings.push("Shift scheduled on Saturday (Maldives weekend).");
  }

  const effectiveWorkingMinutes = Math.max(0, operatingMinutes - mandatoryPauseMinutes);

  return {
    isOperatingDay,
    isWeekend,
    overlapsFridayPrayer,
    operatingMinutes,
    mandatoryPauseMinutes,
    effectiveWorkingMinutes,
    warnings,
  };
}
