# STARQ ERP cloud API

`starq-api` is the only cloud database boundary used by the garage clients.
Flutter and browser clients never receive the Supabase service-role key and do
not query tables directly.

Required function secrets:

- `STARQBOOKS_SESSION_SECRET`
- `STARQBOOKS_GOOGLE_CLIENT_ID`
- optional `STARQBOOKS_GOOGLE_ANDROID_CLIENT_ID`
- `STARQBOOKS_ALLOWED_ORIGINS` before browser deployment

Deploy with JWT verification disabled because the foundation engine verifies Google ID
tokens and issues its own signed `sb_ops` session. This makes the function a
public authentication boundary, so rate limits, strict origins, payload caps,
CSRF, idempotency and database authorization are mandatory.

No automation principal is enabled for the pilot.
