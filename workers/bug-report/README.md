# SkinForge bug-report relay

A tiny Cloudflare Worker that turns in-app bug reports into GitHub Issues. It exists so the desktop
app never contains a GitHub credential: anything shipped inside an `.exe` can be extracted.

```
App (Electron main) --HTTPS JSON--> Worker --GitHub REST (token secret)--> Issue (labels: bug, user-reported)
                                       \--> R2 (optional screenshots)    \--> KV (rate limits, duplicates)
```

## One-time setup

1. **GitHub token**: create a _fine-grained_ personal access token limited to this repository with only
   **Issues: Read and write**. Prefer a dedicated bot account.
2. **Labels**: create the labels `bug` and `user-reported` in the repository.
3. **KV**: `npx wrangler kv namespace create STATE` and paste the id into `wrangler.toml`.
4. **Screenshots (optional)**: create an R2 bucket, expose it publicly, uncomment `[[r2_buckets]]` and set
   `SCREENSHOT_PUBLIC_URL`. GitHub's REST API has no endpoint for uploading issue attachments, so images
   are hosted on R2 and linked from the issue. Without this, screenshots are silently dropped.
5. **Secret**: `npx wrangler secret put GITHUB_TOKEN`
6. **Deploy**: `npx wrangler deploy` (run inside `workers/bug-report`).
7. **App**: set `bugReportUrl` in `src/shared/constants/appConfig.ts` to the deployed Worker URL and rebuild.

## Abuse protection

- Per-IP (5/hour) and per-installation (10/day) limits, plus the app's own 60 s cooldown.
- Identical reports (title + description fingerprint) return the existing issue instead of creating a new one for 30 days.
- Size limits, strict re-validation, image magic-byte checks, `@mention`/`#123` defusing, fenced logs.
- KV counters are best-effort (not atomic). For a hard cap add a Cloudflare **Rate Limiting rule** on the route.

> [!NOTE]
> The endpoint URL is public, so a determined attacker can still call it directly; the limits above bound the damage,
> and the token's scope (Issues only on one repo) bounds the worst case. Rotate the token if abused.
