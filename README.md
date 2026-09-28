# starqERP

> **Modern, Multi-Tenant SME Operating System & ERP for the Maldives**  
> Built on PostgreSQL Row-Level Security, Supabase Edge Functions, React 19, and Material 3 Design.

---
> [!IMPORTANT]
> **StarqERP development is ON HOLD — trajectory corrected 28 September 2026.**
>
> On 28 September 2026 the Founder stopped StarqERP development and corrected its completion
> model. Development was progressing **component-first / schema-first** — completing isolated
> modules — while an ERP approaching completion must be organised **business-process-first**.
>
> The governing model is now: **close complete ERP business processes**, across five canonical
> chains — **Order-to-Cash, Procure-to-Pay, Inventory-to-GL, Cash-to-Bank, Record-to-Report** —
> from user intent through operational truth, accounting/subledger consequence, audit,
> reconciliation and reporting. A green build, a merged module, or a closed ticket is no
> longer evidence that a business capability is complete.
>
> This is **convergence, not rewrite**. All architecture, migrations, tests and shipped
> capabilities described below remain valid and are retained. The **Canonical Roadmap
> Snapshot** and **board progress** figures further down are a pre-28-Sep baseline and are
> retained as history — they do not reflect the corrected trajectory or current task state.
>
> **The canonical development doctrine and roadmap are private and live in the `starqERP`
> repository — they are not duplicated here by design.** Consult those before planning any
> StarqERP work.

---


## Overview

### What It Is
**starqERP** is a full-stack, multi-tenant Enterprise Resource Planning (ERP) platform designed for small-to-medium enterprises (SMEs) operating in the Maldives. It unifies commercial operations, inventory control, job card and service workflow management, double-entry bookkeeping, and Maldives Inland Revenue Authority (MIRA) GST compliance into a cohesive, high-performance web experience.

### Why It Exists
Most legacy ERP systems deployed across the Maldives and developing island economies suffer from severe operational friction:
1. **Disconnected Systems**: Point-of-sale, workshop job cards, accounting, and tax filing operate in isolated silos, causing reconciliation errors and delayed reporting.
2. **Missing Local Compliance**: General-purpose international accounting packages lack native support for Maldivian BPT, TGST, and General GST tax period filings and currency rules.
3. **Rigid Organizational Models**: Traditional software struggles to accommodate modern island businesses where a single holding company operates multiple diverse business activities (e.g., an automotive workshop and a software consultancy) sharing physical facilities.

**starqERP** solves this by establishing a mathematically rigorous, zero-trust organizational spine with native multi-book architecture.

---

## Two-Plane Architecture Model

starqERP separates the SaaS platform into two strictly segregated operating planes:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      starqERP Architecture Model                       │
├──────────────────────────────────┬─────────────────────────────────────┤
│      Starq HQ Control Plane      │      Tenant ERP Execution Plane     │
│   (SaaS Operator Perspective)    │    (Business Owner Perspective)     │
├──────────────────────────────────┼─────────────────────────────────────┤
│ • Tenant Lifecycle & Provisioning│ • Commercial Sales & Invoicing      │
│ • Subscription Plans & Billing   │ • Service Workflow & Job Cards      │
│ • Platform Usage & Telemetry     │ • Real-time Inventory Valuation     │
│ • Cross-Tenant Security Audit    │ • Double-Entry Journal Postings     │
│ • Verification & Onboarding      │ • Maldives MIRA GST Tax Filing      │
└──────────────────────────────────┴─────────────────────────────────────┘
```

- **Starq HQ Control Plane (`activePlane === 'platform'`)**: Accessible **strictly** via explicit platform operator entitlement (`session.platform_entitlement`). It provides the SaaS management tools required to provision, monitor, bill, and govern tenants across the cluster.
- **Tenant ERP Execution Plane (`activePlane === 'tenant'`)**: The operational day-to-day workspace where business owners, accountants, inventory clerks, and technicians run business operations within strictly isolated tenant boundaries.

---

## Organizational & Authority Hierarchy

starqERP implements a strict 5-tier entity spine:

$$\text{Identity} \longrightarrow \begin{matrix} \text{Platform Entitlement} \\ \text{and/or} \\ \text{Tenant Memberships} \end{matrix} \longrightarrow \text{Legal Entity} \longrightarrow \text{Business / Trading Name} \longrightarrow \text{Operating Book} \longrightarrow \text{Location / Facility}$$

1. **Identity & Principal**: Authenticated user identity (via verified Google Workspace account).
2. **Platform Entitlement & Tenant Memberships**: Determines whether the principal operates at the platform SaaS plane or within specific customer organizations.
3. **Legal Entity (`organisations`)**: The registered corporate entity holding legal liability, tax registration (TIN), and bank accounts.
4. **Business / Trading Names (`business_names`)**: Registered trading names operating under the legal entity.
5. **Operating Books (`books`)**: Discrete double-entry ledgers corresponding to specific commercial activities (e.g., *Automotive Workshop*, *General Retail*, *Software Engineering*).
6. **Locations & Facilities (`locations`, `book_locations`)**: Physical workshops, warehouses, and counters mapped to one or more operable books.

---

## Core Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Material 3 Adaptive Layout System, Lucide Icons, Vite.
- **Backend & API Gateway**: Supabase Edge Functions (Deno runtime), TypeScript Shared Command Contracts, HMAC Session Security.
- **Database & Storage**: PostgreSQL 15+ with strict Row-Level Security (RLS), Composite Foreign Keys, Immutable Append-Only Audit & Ledger Triggers.
- **Identity & Access**: Google Identity Services (OAuth 2.0 / OpenID Connect), Platform-Audience Verification, Time-based OTP Multi-Factor Authentication (MFA).

---

## Implementation & Release Status

### Shipped Capabilities

The accounting spine landed in `main` on 29 August 2026. These modules are merged and building; acceptance review is tracked separately from delivery, so "merged" here does not mean "signed off".

| Area | Capability | Status |
| :--- | :--- | :--- |
| **General Ledger** | Chart of Accounts with account hierarchy management | Merged |
| | Live double-entry journal posting and GL explorer | Merged |
| | Authoritative trial balance and balance sheet, with a zero-variance invariant | Merged |
| | Accounting period lock, audited unlock, and fiscal year-end roll-forward to retained earnings | Merged |
| **Receivables** | Credit notes, customer advance deposits and settlement allocation | Merged |
| | Customer credit limits and automated dunning | Merged |
| | AR / AP ageing with drill-down | Merged |
| **Banking** | Bank and cash ledger with BML / MIB CSV statement reconciliation | Merged |
| | Multi-currency purchasing with MMA rates and FX gain/loss | Merged |
| **Maldives Tax** | MIRA GST-201 return schedule and export, box 1 through 13 | Merged |
| | Tourism GST (TGST) and Green Tax, with citizen exemption handling | Merged |
| **Localization** | Bilingual Dhivehi (Thaana) and English document print engine | Merged |
| | MMA Favara instant QR payment generation | Merged |
| **Operations** | Job costing, multi-warehouse transfers, production orders, payroll | Merged |
| **Platform** | Two-plane control plane, tenant provisioning, staff invitation lifecycle | Merged |
| **Reporting** | Direct and indirect IFRS cash flow statement | Merged |
| | Consolidated multi-book and multi-outlet reporting | Merged |

### Engineering Quality Gates

Every push runs both gates in CI:

| Gate | Current |
| :--- | :--- |
| TypeScript strict typecheck | **0 errors** |
| Vitest suite | **81 files, 292 passing** |
| Playwright end-to-end | **15 passing** across Chromium, Firefox, WebKit and mobile |
| Production build | **Clean** |
| Secret and credential sweep | **0 findings** |
| Migration lint | **Clean**, 31 migrations, monotonic |

### Canonical Roadmap Snapshot
*Baseline Snapshot Date: 2026-09-06 | Release: v0.2.0-beta*

| Milestone Gate | Scope & Focus | Status |
| :--- | :--- | :--- |
| **Gate 1 (G1)** | **Commercial Pilot Readiness** — Dual-tenant spine, RLS isolation, session boundaries, inventory valuation, job workflows, invoice lifecycle. | **Active / Near Completion** |
| **Gate 2 (G2)** | **ERP Replacement Readiness** — Full double-entry general ledger, bank reconciliations, multi-currency purchasing, audit trail immutability. | **Active** — implementations merged, acceptance review pending |
| **Gate 3 (G3)** | **Maldives Competitive Advantage** — Native MIRA GST filing integration, Dhivehi localization, BML payment gateway, offline sync resilience. | **Partially delivered** — GST-201, Dhivehi print and Favara QR merged; offline sync still planned |
| **Gate 4 (G4)** | **Enterprise Scale & Governance** — Multi-region replication, automated continuous compliance, high-availability tenancy failover. | **Planned** |

*Canonical Board Progress: **179 of 387 tasks completed (46.25%)** across G1-G4. Figures are read from the Nexus board SSOT (`starq-erp-tasks.json`) at each manual snapshot refresh — not a live/automated feed, so treat this number as accurate as of the Baseline Snapshot Date above, not real-time.*

---

## Security & Tenant Isolation Model

starqERP is built upon zero-trust architectural principles:

- **Row-Level Security (RLS)**: Every tenant-facing database table enforces RLS filtered on `organisation_id = auth.current_org()`.
- **Composite Tenant-Safe Foreign Keys**: Foreign keys across operating books and execution records enforce composite integrity `(organisation_id, id)`.
- **Immutable Append-Only Records**: Audit logs, security events, job event history, and general journal entries are guarded by PostgreSQL database triggers that reject `UPDATE` and `DELETE` mutations.
- **Session Cryptography & CSRF**: Authenticated sessions are HMAC-SHA256 signed, transmitted via `HttpOnly; Secure; SameSite=None` cookies, and validated on every state-changing mutation with cryptographic CSRF challenge tokens.
- **Segregation of Duties (SoD)**: 12 standardized system seats (e.g. `managing_director`, `financial_controller`, `quartermaster`, `technician`) enforce separation of privileges across purchasing, payment disbursement, and inventory issuance.

---

## Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) v20+ or v22+
- [npm](https://www.npmjs.com/) v10+
- [Supabase CLI](https://supabase.com/docs/guides/cli) v2.100+
- [Docker Desktop](https://www.docker.com/) (for local database emulation)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/almstq/starqERP.git
cd starqERP
npm --prefix web install
```

### 2. Configure Environment Variables
Copy the example environment configuration:
```bash
cp web/.env.example web/.env.local
```
Update `web/.env.local` with your local development parameters:
```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-local-anon-key
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

### 3. Start Local Supabase Stack & Apply Migrations
```bash
supabase start
supabase db reset
```

### 4. Run Development Server
```bash
npm --prefix web run dev
```
Open [http://localhost:3001](http://localhost:3001) in your browser.

---

## Verification & Testing

starqERP maintains a comprehensive automated testing suite across frontend components, database policies, and API contracts:

```bash
# Run frontend unit & component regression tests (Vitest)
npm --prefix web test

# Run TypeScript typechecks and linter
npm --prefix web run lint

# Run database migration verification suites
node --test tests/migrations_0024_0025_verification.test.mjs

# Run responsive layout & viewport tests
node --test tests/ui_responsive_system.test.mjs
```

---

## Repository Layout

```
starqERP/
├── contracts/               # Single-source-of-truth authorization & command schemas
├── docs/                    # Architecture, security, and developer documentation
│   ├── architecture/        # Domain, multi-tenancy, and accounting models
│   ├── development/         # Setup, testing, and migration guides
│   ├── security/            # Zero-trust, MFA, and RLS specifications
│   └── roadmap/             # Canonical public capability milestones
├── supabase/                # Database migrations, seed data, and Edge Functions
│   ├── functions/starq-api/ # Edge API gateway and session resolvers
│   └── migrations/          # Versioned PostgreSQL database migrations
├── tests/                   # Security probes, isolation fixtures, and contract tests
└── web/                     # React 19 / TypeScript / Material 3 web application
    └── src/
        ├── app/             # Application shell, router, and login surfaces
        ├── components/      # Domain views (Dashboard, Jobs, Invoicing, Platform HQ)
        ├── context/         # Auth, ERP workspace, and theme state providers
        ├── domain/          # Business archetypes and entity models
        ├── lib/             # Bookkeeping calculations and utilities
        ├── services/        # API gateway, telemetry, and auth clients
        └── test/            # Vitest unit and regression test specifications
```

---

## Contributing & License

### Contributing
Contributions and security vulnerability reports are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`SECURITY.md`](./SECURITY.md) before submitting pull requests or vulnerability disclosures.

### License
Copyright © 2026 Starq Technologies Pvt Ltd. All rights reserved.  
Distributed under the terms specified in [`LICENSE`](./LICENSE).
