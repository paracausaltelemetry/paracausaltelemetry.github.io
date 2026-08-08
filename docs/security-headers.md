# Security headers

GitHub Pages cannot send custom HTTP response headers, so this site ships the
best static equivalents: a per-page `Content-Security-Policy` `<meta>` tag and
a `referrer` meta policy. Two important headers have **no** meta equivalent
and need an edge in front of GitHub Pages:

- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`

(`X-Frame-Options` is superseded by the CSP `frame-ancestors` directive, which
is also meta-ignored — same boat.)

## Recommended: Cloudflare in front of GitHub Pages (free tier)

1. Add the domain to Cloudflare and move DNS there (keep the existing
   `CNAME` record pointing at `paracausaltelemetry.github.io`, proxied/orange).
2. SSL/TLS mode: **Full (strict)**.
3. Create a **Response Header Transform Rule** (Rules → Transform Rules →
   Modify Response Header) applying to all requests, setting:

   | Header | Value |
   | --- | --- |
   | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
   | `X-Content-Type-Options` | `nosniff` |
   | `Referrer-Policy` | `strict-origin-when-cross-origin` |
   | `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
   | `Content-Security-Policy` | copy the meta value from `index.html`, plus `; frame-ancestors 'none'` |

4. Once the real CSP header is live, the per-page meta tags can stay (they are
   harmless duplicates) or be removed in a later pass.
5. Verify with https://securityheaders.com — target grade A.

### Status — needs setting up for paracausaltelemetry.com

The transform rule described above ran on the previous domain and has **not**
been recreated for `paracausaltelemetry.com` yet. Until it is, the site ships
without HSTS, `nosniff`, or a real CSP header.

There are no per-page CSP `<meta>` tags: the header is the single source of
truth. If the CSP ever needs a new source (e.g. another `connect-src` origin),
change it in the Cloudflare rule, not in HTML.

#### Inline theme script hash

Every page runs one inline `<script>` that reads the `pt_theme` cookie and
paints the initial theme before first paint. `script-src` must allow it by
hash:

```
'sha256-HlYZfhxwF3LSSm1p6LErAjcb16+zr+rCG8YAJsYLt2g='
```

That hash covers this exact script body:

```js
(function(){try{var m=document.cookie.match(/(?:^|;\s*)pt_theme=(light|dark)/);var t=m?m[1]:localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="light"||(!t&&!d))document.body.classList.add("light-mode");}catch(e){}})();
```

Change one byte of it and the hash must be recomputed and the Cloudflare rule
updated, or theming breaks site-wide.

#### `connect-src` origins still in use

`api.github.com` and `raw.githubusercontent.com` (writeups reader),
`ipwho.is` and `api.open-meteo.com` (the click-gated forecast panel on the
home page).

## While DNS is open

- Confirm SPF, DKIM, and DMARC (`p=reject` once aligned) for
  `paracausaltelemetry.com` mail.
- Add a `CAA` record pinning issuance to the CAs actually used
  (GitHub Pages uses Let's Encrypt: `0 issue "letsencrypt.org"`).
- Enable DNSSEC if the registrar supports it.
