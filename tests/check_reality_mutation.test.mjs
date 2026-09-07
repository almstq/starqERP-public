import assert from 'node:assert/strict';
import {
  checkSeatOccupancy,
  checkPortalContractDrift,
  checkRequiredHeaders,
  checkOauthIdentity,
  checkGatewayDeclared,
  checkCookieScope,
} from '../scripts/check-reality.mjs';

console.log('=== SERP-137: Running Mutation Tests for check-reality.mjs ===\n');

// 1. Seat Occupancy Mutations
{
  console.log('1. Seat Occupancy:');
  // Mutation 1A: Removing receiver seat leaves receive step unfulfilled
  const mutatedAllowlist = {
    people: [
      { id: 'p1', seats: ['quartermaster', 'stores', 'financial_controller', 'payer', 'counter', 'technician', 'qc_signer', 'ledger_poster'] }
    ]
  };
  const res = checkSeatOccupancy({ allowlistData: mutatedAllowlist });
  assert.equal(res.state, 'FAIL');
  assert.match(res.detail, /receive needs receiver/);
  console.log('  ✓ PASS: Mutating allowlist to omit "receiver" causes check to FAIL');

  // Mutation 1B: Broken contract format
  const brokenContract = 'export const NOT_PURCHASE = []';
  const res2 = checkSeatOccupancy({ allowlistData: mutatedAllowlist, contractContent: brokenContract });
  assert.equal(res2.state, 'FAIL');
  assert.match(res2.detail, /could not parse PURCHASE_STEP_SEATS/);
  console.log('  ✓ PASS: Malformed contract syntax causes check to FAIL');
}

// 2. Portal Contract Drift Mutations
{
  console.log('2. Portal vs Contract Drift:');
  // Mutation 2A: Missing seat in auth.py
  const mutatedAuth = `
SEATS = {
    "managing_director": { "label": "MD" },
    "director": { "label": "Dir" },
    "financial_controller": { "label": "FC" },
    "quartermaster": { "label": "QM" },
    "receiver": { "label": "Rec" },
    "payer": { "label": "Payer" },
    "counter": { "label": "Counter" },
    "technician": { "label": "Tech" },
    "qc_signer": { "label": "QC" },
    "stores": { "label": "Stores" },
    "ledger_poster": { "label": "Books" },
}
SCM_STEP_SEATS = {
    "need": ["quartermaster", "managing_director", "director"],
    "quote": ["quartermaster"],
    "award": ["financial_controller"],
    "receive": ["receiver"],
    "match": ["financial_controller"],
    "pay": ["payer"],
}
`;
  const res = checkPortalContractDrift({ authContent: mutatedAuth });
  assert.equal(res.state, 'FAIL');
  assert.match(res.detail, /portal is missing seat\(s\) the contract defines: owner/);
  console.log('  ✓ PASS: Missing "owner" seat in portal auth.py causes check to FAIL');

  // Mutation 2B: Step matrix mismatch in auth.py
  const mutatedAuthSteps = `
SEATS = {
    "owner": { "label": "Owner" },
    "managing_director": { "label": "MD" },
    "director": { "label": "Dir" },
    "financial_controller": { "label": "FC" },
    "quartermaster": { "label": "QM" },
    "receiver": { "label": "Rec" },
    "payer": { "label": "Payer" },
    "counter": { "label": "Counter" },
    "technician": { "label": "Tech" },
    "qc_signer": { "label": "QC" },
    "stores": { "label": "Stores" },
    "ledger_poster": { "label": "Books" },
}
SCM_STEP_SEATS = {
    "need": ["quartermaster", "managing_director", "director"],
    "quote": ["quartermaster", "managing_director"],
    "award": ["financial_controller"],
    "receive": ["receiver"],
    "match": ["financial_controller"],
    "pay": ["payer"],
}
`;
  const resStep = checkPortalContractDrift({ authContent: mutatedAuthSteps });
  assert.equal(resStep.state, 'FAIL');
  assert.match(resStep.detail, /step 'quote' differs/);
  console.log('  ✓ PASS: Mutating step matrix in portal auth.py causes check to FAIL');
}

// 3. Required Headers Mutations
{
  console.log('3. Required Headers:');
  // Mutation 3A: Edge reads header that client does not send
  const edgeCode = `
const clientKind = req.headers.get("x-starq-client-kind");
const idemp = req.headers.get("x-idempotency-key");
headers.set("Access-Control-Allow-Headers", "x-starq-client-kind, x-csrf-token, x-idempotency-key");
`;
  const clientMissingHeader = `
headers['x-starq-client-kind'] = 'web';
headers['x-csrf-token'] = token;
`;
  const res = checkRequiredHeaders({ edgeContent: edgeCode, clientContent: clientMissingHeader });
  assert.equal(res.state, 'FAIL');
  assert.match(res.detail, /x-idempotency-key is read by the Edge and never sent by the client/);
  console.log('  ✓ PASS: Missing client header causes check to FAIL');

  // Mutation 3B: Client sends header not allowed in CORS
  const clientFullCode = `
headers['x-starq-client-kind'] = 'web';
headers['x-csrf-token'] = token;
headers['x-idempotency-key'] = key;
`;
  const mutatedEdgeCors = `
const clientKind = req.headers.get("x-starq-client-kind");
headers.set("Access-Control-Allow-Headers", "x-starq-client-kind, x-csrf-token");
`;
  const resCors = checkRequiredHeaders({ edgeContent: mutatedEdgeCors, clientContent: clientFullCode });
  assert.equal(resCors.state, 'FAIL');
  assert.match(resCors.detail, /x-idempotency-key is sent by the client but missing from access-control-allow-headers/);
  console.log('  ✓ PASS: Missing CORS header causes check to FAIL');
}

// 4. OAuth Identity Mutations
{
  console.log('4. OAuth Identity:');
  // Mutation 4A: Web and env project ID mismatch
  const mutatedDefines = {
    GOOGLE_SERVER_CLIENT_ID: '999999999999-abc.apps.googleusercontent.com',
    GOOGLE_ANDROID_CLIENT_ID: '999999999999-xyz.apps.googleusercontent.com'
  };
  const envContent = 'STARQBOOKS_GOOGLE_CLIENT_ID=901212915429-l7i347so1avnr0dnaq50hfi91fm0d0o4.apps.googleusercontent.com';
  const res = checkOauthIdentity({ definesData: mutatedDefines, envContent });
  assert.equal(res.state, 'FAIL');
  assert.match(res.detail, /GOOGLE_SERVER_CLIENT_ID does not match/);
  console.log('  ✓ PASS: Mismatched Google Client ID across env/defines causes check to FAIL');
}

// 5. Gateway Settings Mutations
{
  console.log('5. Gateway Settings:');
  // Mutation 5A: Missing functions.starq-api section
  const tomlMissing = `
[project]
id = "test"
`;
  const res = checkGatewayDeclared({ configContent: tomlMissing });
  assert.equal(res.state, 'FAIL');
  assert.match(res.detail, /config\.toml has no \[functions\.starq-api\] section/);
  console.log('  ✓ PASS: Missing [functions.starq-api] section causes check to FAIL');

  // Mutation 5B: verify_jwt set to true
  const tomlJwt = `
[functions.starq-api]
verify_jwt = true
`;
  const resJwt = checkGatewayDeclared({ configContent: tomlJwt });
  assert.equal(resJwt.state, 'FAIL');
  assert.match(resJwt.detail, /verify_jwt is not pinned to false/);
  console.log('  ✓ PASS: verify_jwt = true causes check to FAIL');
}

// 6. Cookie Scope Mutations
{
  console.log('6. Cookie Scope:');
  // Mutation 6A: SameSite=Strict on cross-site Edge
  const edgeStrict = `
const cookie = "sb_ops=123; SameSite=Strict; HttpOnly; Secure";
`;
  const res = checkCookieScope({ edgeContent: edgeStrict });
  assert.equal(res.state, 'FAIL');
  assert.match(res.detail, /SameSite=Strict/);
  console.log('  ✓ PASS: SameSite=Strict on cross-site cookie causes check to FAIL');

  // Mutation 6B: Missing Secure attribute
  const edgeInsecure = `
const cookie = "sb_ops=123; SameSite=None; HttpOnly";
`;
  const resInsecure = checkCookieScope({ edgeContent: edgeInsecure });
  assert.equal(resInsecure.state, 'FAIL');
  assert.match(resInsecure.detail, /Secure is missing/);
  console.log('  ✓ PASS: Missing Secure flag causes check to FAIL');
}

console.log('\n======================================================');
console.log('✓ ALL 10 MUTATION TEST CASES PASSED CLEANLY');
console.log('======================================================');
