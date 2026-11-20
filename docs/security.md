# FitPulse security baseline

## Implemented controls

- Nginx is the only public entry point in the Compose stack; backend ports bind to localhost by default.
- Security headers, CSP, gzip, request-size limits, hidden framework headers, and per-IP API rate limiting are configured at the edge.
- Request IDs are propagated from Nginx to Node, Java, and Python services.
- Service containers run as non-root users with read-only root filesystems, dropped capabilities, and `no-new-privileges`.
- PostgreSQL and Redis require credentials; Redis uses password auth and persistence.
- Checkout validates input, uses parameterized SQL, protects stock with transactional updates, and stores price/name snapshots.
- Order events are written to a transactional outbox and published idempotently; malformed stream events are dead-lettered.
- Operational endpoints (`/healthz`, `/readyz`, `/metrics`) exist per service; `/metrics` is not exposed through the public web proxy.

## External integrations still required for production

- **TLS termination**: terminate at ingress/WAF or add a TLS terminator; Nginx currently serves HTTP only.
- **Authentication/authorization**: the demo APIs are public. Add OIDC/JWT/session auth, RBAC, and audit logging before exposing real customer data.
- **Payments**: checkout is a demo flow with no payment gateway. Integrate a PCI-compliant provider and webhook verification.
- **Carrier fulfilment**: the fulfilment simulator is for development/demo. Replace with a real carrier webhook/API and signature verification.
- **Secrets management**: inject `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, and any API keys from a secrets manager; never bake them into images.
- **Network segmentation**: use Kubernetes NetworkPolicy/security groups so services can reach only required dependencies.

## Recommended next controls

- mTLS or signed service tokens for service-to-service calls.
- Centralized structured logs with request ID correlation and PII redaction.
- Rate limits per tenant/user in addition to per-IP edge limits.
- WAF rules, bot protection, and anomaly detection at the edge.
- Dependency pinning, SBOM generation, image signing, and admission policies in Kubernetes.
