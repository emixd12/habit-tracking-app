# Crawl Policy

This document records the public marketing site's crawl-policy decision for
Ticket 031.

## Current decision

The Astro marketing site uses a max-visibility public posture:

- Training crawlers: allowed for public marketing content.
- AI search indexers: allowed for public marketing content.
- User-triggered fetchers: allowed for public marketing content.
- Public machine-readable files such as `/llms.txt`, `/llms-full.txt`,
  `.md` mirrors, `/data/route-manifest.json`, and `/sitemap.xml`: allowed.
- Authenticated app routes and user data: excluded by architecture and auth,
  not by robots rules.

`robots.txt` therefore uses:

```txt
User-agent: *
Allow: /

Sitemap: <marketing-site>/sitemap.xml
```

No Content-Signal directive is emitted at launch. If training, AI search,
user-triggered fetching, or Content-Signal posture changes later, update this
document and regenerate the marketing `robots.txt` from
`apps/marketing/src/data/agent-output.ts`.

## Boundaries

Robots rules are not access control. Private account data remains protected by
Supabase Auth, Row Level Security, and manifest exclusion. Do not list secret,
admin, preview, staging, or private paths in robots rules.

