# Security & Vulnerability Disclosure Policy

Starq Technologies takes the security of our systems and the confidentiality of our clients' commercial data seriously. We appreciate the valuable contribution of the security research community in helping us keep our systems safe.

## Coordinated Vulnerability Disclosure & Safe Harbor

We pledge not to initiate legal action against security researchers for finding or reporting security vulnerabilities, provided they conduct their research in good faith and adhere to the following principles:

1. **Good Faith**: You conduct research strictly to remediate vulnerabilities and prevent harm.
2. **No Disruption or Exfiltration**: You do not degrade our services, destroy data, execute Denial of Service (DoS) attacks, or exfiltrate client records beyond what is strictly necessary to demonstrate a proof-of-concept (PoC).
3. **No Social Engineering or Physical Attacks**: You do not engage in phishing, social engineering, or physical attacks against Starq employees, contractors, or facilities.
4. **Coordinated Disclosure**: You give us reasonable time to investigate, remediate, and verify a fix before any public disclosure.

If your research complies with these guidelines, we consider it authorized and will not pursue civil action or report your activities to law enforcement.

## Monitored Security Contact

Please report security issues and vulnerabilities directly to our monitored security inbox:

* **Primary Security Email**: `security@starq.mv`
* **Founder & Escalation Contact**: `founder@starq.mv`
* **Security Contact (Alternative)**: `security@starqtech.com`
* **Canonical Policy URL**: `https://erp.starq.mv/.well-known/security.txt`

## Response Commitments & SLAs

We hold ourselves to strict response targets:

* **Initial Acknowledgment**: Within **24 hours** of receipt.
* **Triage & Severity Classification**: Within **72 hours**.
* **Remediation & Status Updates**: Regular updates at least every 5 business days until resolution.

## How Reports are Processed

Every verified security vulnerability received at our security address:
1. Is formally assigned a Tracking ID and severity tier (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
2. Becomes a tracked, blocking engineering task on the StarqNexus control-plane board.
3. Is remediated through the standard pull-request, testing, and preflight gate — **never through an informal or untracked hotfix**.
4. Receives attribution on our Acknowledgments page upon mutual agreement.

---
*Last Reviewed: 26 August 2026*
