import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateTenantImportPack,
  rehearseTenantImportPipeline,
  CLUB_IGNITION_TEST_PACK_V1,
  STARQ_PARENT_TEST_PACK_V1,
  TenantImportPack,
} from "../../contracts/tenant_import_pipeline.ts";

Deno.test("M1-ORGS-001: Club Ignition Test Pack #1 passes structural and balance validation", () => {
  const result = validateTenantImportPack(CLUB_IGNITION_TEST_PACK_V1);
  assertEquals(result.isValid, true);
  assertEquals(result.errors.length, 0);
  assertEquals(result.tenantId, "tenant-ignition");
  assertEquals(result.summary.stageCount, 8);
  assertEquals(result.summary.roleCount, 5);
  assertEquals(result.summary.customerCount, 2);
  assertEquals(result.summary.inventoryCount, 3);
  assertEquals(result.summary.accountsCount, 1);
});

Deno.test("M1-ORGS-001: Starq Technologies Parent Company Pack passes validation (0% GST)", () => {
  const result = validateTenantImportPack(STARQ_PARENT_TEST_PACK_V1);
  assertEquals(result.isValid, true);
  assertEquals(result.errors.length, 0);
  assertEquals(result.tenantId, "tenant-starq");
  assertEquals(result.summary.stageCount, 4);
  assertEquals(result.summary.roleCount, 3);
  assertEquals(result.summary.customerCount, 1);
});

Deno.test("M1-ORGS-001: Rehearsal of import pipeline provisions both tenants with strict cross-tenant isolation", () => {
  const environment = {
    existingTenants: new Set<string>(),
    isolatedStore: new Map<string, Map<string, any[]>>(),
  };

  // 1. Rehearse Club Ignition
  const ignResult = rehearseTenantImportPipeline(CLUB_IGNITION_TEST_PACK_V1, environment);
  assertEquals(ignResult.success, true);
  assertEquals(ignResult.provisionedTenantId, "tenant-ignition");
  assertEquals(ignResult.isolationVerified, true);
  assert(ignResult.totalRecordsProvisioned >= 15);

  // 2. Rehearse Starq Technologies
  const starqResult = rehearseTenantImportPipeline(STARQ_PARENT_TEST_PACK_V1, environment);
  assertEquals(starqResult.success, true);
  assertEquals(starqResult.provisionedTenantId, "tenant-starq");
  assertEquals(starqResult.isolationVerified, true);

  // 3. Verify strict boundary isolation between both provisioned tenants
  const ignStore = environment.isolatedStore.get("tenant-ignition")!;
  const starqStore = environment.isolatedStore.get("tenant-starq")!;

  assertEquals(ignStore.get("workflow_stages")?.length, 8);
  assertEquals(starqStore.get("workflow_stages")?.length, 4);

  const ignCusts = ignStore.get("customers")!;
  const starqCusts = starqStore.get("customers")!;

  assert(ignCusts.every((c) => c.tenantId === "tenant-ignition"));
  assert(starqCusts.every((c) => c.tenantId === "tenant-starq"));

  // Ensure zero cross-contamination
  assert(!ignCusts.some((c) => c.tenantId === "tenant-starq"));
  assert(!starqCusts.some((c) => c.tenantId === "tenant-ignition"));
});

Deno.test("M1-ORGS-001: Rejects adversarial pack with cross-tenant bank account smuggling", () => {
  const tamperedPack: TenantImportPack = {
    ...CLUB_IGNITION_TEST_PACK_V1,
    tenantId: "tenant-ignition",
    bankAccounts: [
      {
        id: "bnk-smuggled",
        tenantId: "tenant-starq", // Illegally trying to attach Starq bank account to Ignition
        accountType: "checking",
        accountName: "Smuggled Bank",
        currency: "MVR",
        bankName: "BML",
        isDefault: false,
        isActive: true,
      },
    ],
  };

  const validation = validateTenantImportPack(tamperedPack);
  assertEquals(validation.isValid, false);
  assert(validation.errors.some((e) => e.includes("does not match pack.tenantId")));
});

Deno.test("M1-ORGS-001: Rejects adversarial pack with unbalanced opening balance (DEC-043)", () => {
  const tamperedPack: TenantImportPack = {
    ...CLUB_IGNITION_TEST_PACK_V1,
    openingBalances: [
      { accountCode: "1000", accountName: "Cash", debit: 50000, credit: 0 },
      { accountCode: "2000", accountName: "AP", debit: 0, credit: 40000 }, // Out of balance by 10,000 MVR
    ],
  };

  const validation = validateTenantImportPack(tamperedPack);
  assertEquals(validation.isValid, false);
  assert(validation.errors.some((e) => e.includes("opening balances do not balance")));
});
