import { describe, it, expect } from 'vitest';

export interface ArtifactChecksum {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface TestEvidenceRecord {
  readonly suite: string;
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly passedAt: string;
}

export interface SecurityGatesSummary {
  readonly tenantHardcodingViolations: number;
  readonly privilegedPathsInventoried: boolean;
  readonly privacyTelemetryCompliant: boolean;
  readonly migration0011Gated: boolean;
  readonly migration0021Rehearsed: boolean;
}

export interface ReleaseCandidateManifest {
  readonly manifestVersion: string;
  readonly releaseCandidateId: string;
  readonly gitCommitHead: string;
  readonly environment: 'production' | 'staging' | 'disposable_rehearsal';
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly artifacts: readonly ArtifactChecksum[];
  readonly testEvidence: readonly TestEvidenceRecord[];
  readonly securityGates: SecurityGatesSummary;
  readonly manifestSignature: string;
}

export function computeManifestSignature(data: {
  releaseCandidateId: string;
  gitCommitHead: string;
  artifacts: readonly ArtifactChecksum[];
  testEvidence: readonly TestEvidenceRecord[];
  securityGates: SecurityGatesSummary;
}): string {
  const artifactStr = data.artifacts.map((a) => `${a.path}:${a.sha256}`).sort().join('|');
  const testStr = data.testEvidence.map((t) => `${t.suite}:${t.passed}/${t.total}`).sort().join('|');
  const gateStr = `${data.securityGates.tenantHardcodingViolations}:${data.securityGates.migration0011Gated}:${data.securityGates.migration0021Rehearsed}`;
  const raw = `${data.releaseCandidateId}@${data.gitCommitHead}#${artifactStr}#${testStr}#${gateStr}`;

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sig_rc_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export function validateReleaseCandidateManifest(
  rawManifest: unknown,
): { valid: boolean; error?: string; manifest?: ReleaseCandidateManifest } {
  if (!rawManifest || typeof rawManifest !== 'object') {
    return { valid: false, error: 'invalid_manifest_object' };
  }

  const m = rawManifest as Record<string, unknown>;

  if (m.manifestVersion !== '1.0') {
    return { valid: false, error: 'unsupported_manifest_version' };
  }

  const gitCommitHead = String(m.gitCommitHead || '').trim();
  if (!/^[a-f0-9]{7,40}$/i.test(gitCommitHead)) {
    return { valid: false, error: 'invalid_git_commit_head' };
  }

  const artifacts = (m.artifacts || []) as ArtifactChecksum[];
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return { valid: false, error: 'empty_artifact_manifest' };
  }

  for (const art of artifacts) {
    if (!art.path || !/^[a-f0-9]{64}$/i.test(art.sha256 || '') || typeof art.byteLength !== 'number') {
      return { valid: false, error: `invalid_artifact_entry: ${art.path || 'unknown'}` };
    }
  }

  const testEvidence = (m.testEvidence || []) as TestEvidenceRecord[];
  if (!Array.isArray(testEvidence) || testEvidence.length === 0) {
    return { valid: false, error: 'empty_test_evidence' };
  }

  for (const t of testEvidence) {
    if (t.failed > 0 || t.passed !== t.total || t.total === 0) {
      return { valid: false, error: `failed_test_suite_detected: ${t.suite}` };
    }
  }

  const securityGates = (m.securityGates || {}) as SecurityGatesSummary;
  if (securityGates.tenantHardcodingViolations !== 0) {
    return { valid: false, error: 'tenant_hardcoding_violations_detected' };
  }

  if (
    !securityGates.privilegedPathsInventoried ||
    !securityGates.privacyTelemetryCompliant ||
    !securityGates.migration0011Gated ||
    !securityGates.migration0021Rehearsed
  ) {
    return { valid: false, error: 'security_gate_unverified' };
  }

  const releaseCandidateId = String(m.releaseCandidateId || '');
  const expectedSig = computeManifestSignature({
    releaseCandidateId,
    gitCommitHead,
    artifacts,
    testEvidence,
    securityGates,
  });

  if (m.manifestSignature !== expectedSig) {
    return { valid: false, error: 'manifest_signature_mismatch' };
  }

  return {
    valid: true,
    manifest: {
      manifestVersion: '1.0',
      releaseCandidateId,
      gitCommitHead,
      environment: (m.environment || 'disposable_rehearsal') as ReleaseCandidateManifest['environment'],
      generatedAt: String(m.generatedAt || new Date().toISOString()),
      generatedBy: String(m.generatedBy || 'system'),
      artifacts,
      testEvidence,
      securityGates,
      manifestSignature: expectedSig,
    },
  };
}

describe('SERP-025: Release Candidate & Evidence Manifest Contract', () => {
  const baseValidManifest: ReleaseCandidateManifest = {
    manifestVersion: '1.0',
    releaseCandidateId: 'RC-STARQ-V1-EFFC531',
    gitCommitHead: 'effc531e79fcde5a29ed9adc645bb24aac9cdc63',
    environment: 'production',
    generatedAt: '2026-08-26T22:30:00Z',
    generatedBy: 'Codex & Antigravity (SERP-025)',
    artifacts: [
      {
        path: 'supabase/migrations/202608200001_core_foundation.sql',
        sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        byteLength: 4200,
      },
      {
        path: 'contracts/commands.ts',
        sha256: 'f1e2d3c4b5a60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        byteLength: 95000,
      },
    ],
    testEvidence: [
      {
        suite: 'Deno Contract Negative Conformance',
        total: 112,
        passed: 112,
        failed: 0,
        passedAt: '2026-08-26T22:30:00Z',
      },
      {
        suite: 'Web Vitest Component & Workflow Suite',
        total: 58,
        passed: 58,
        failed: 0,
        passedAt: '2026-08-26T22:30:00Z',
      },
    ],
    securityGates: {
      tenantHardcodingViolations: 0,
      privilegedPathsInventoried: true,
      privacyTelemetryCompliant: true,
      migration0011Gated: true,
      migration0021Rehearsed: true,
    },
    manifestSignature: '',
  };

  it('validates a compliant immutable release candidate manifest', () => {
    const sig = computeManifestSignature(baseValidManifest);
    const manifest = { ...baseValidManifest, manifestSignature: sig };

    const res = validateReleaseCandidateManifest(manifest);
    expect(res.valid).toBe(true);
    expect(res.manifest?.manifestVersion).toBe('1.0');
    expect(res.manifest?.releaseCandidateId).toBe('RC-STARQ-V1-EFFC531');
  });

  it('fails closed when any test suite contains failures', () => {
    const failedSuiteManifest = {
      ...baseValidManifest,
      testEvidence: [
        {
          suite: 'Deno Contract Negative Conformance',
          total: 112,
          passed: 110,
          failed: 2,
          passedAt: '2026-08-26T22:30:00Z',
        },
      ],
    };
    failedSuiteManifest.manifestSignature = computeManifestSignature(failedSuiteManifest);

    const res = validateReleaseCandidateManifest(failedSuiteManifest);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('failed_test_suite_detected');
  });

  it('fails closed when tenant hardcoding violations exist', () => {
    const hardcodedManifest = {
      ...baseValidManifest,
      securityGates: {
        ...baseValidManifest.securityGates,
        tenantHardcodingViolations: 1,
      },
    };
    hardcodedManifest.manifestSignature = computeManifestSignature(hardcodedManifest);

    const res = validateReleaseCandidateManifest(hardcodedManifest);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('tenant_hardcoding_violations_detected');
  });

  it('fails closed on signature tampering or modified artifact hashes', () => {
    const sig = computeManifestSignature(baseValidManifest);
    const tamperedManifest = {
      ...baseValidManifest,
      manifestSignature: sig,
      gitCommitHead: '0000000000000000000000000000000000000000', // modified!
    };

    const res = validateReleaseCandidateManifest(tamperedManifest);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('manifest_signature_mismatch');
  });
});
