# Security headers

GitHub Pages cannot send custom HTTP response headers, so Cloudflare sits in
front of it and adds them with a **Response Header Transform Rule** (Rules →
Transform Rules → Modify Response Header, applying to all requests). There are
no per-page CSP `<meta>` tags: the header is the single source of truth. If the
CSP ever needs a new source (e.g. another `connect-src` origin), change it in
the Cloudflare rule, not in HTML.

## Status: live on paracausaltelemetry.com

Checked on 19 October 2026 (`curl -sI https://paracausaltelemetry.com/`):

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | see below |

```
default-src 'self'; script-src 'self' 'sha256-HlYZfhxwF3LSSm1p6LErAjcb16+zr+rCG8YAJsYLt2g='; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.github.com https://raw.githubusercontent.com; frame-src https://w.soundcloud.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

SSL/TLS mode is **Full (strict)**. Verify any change with
https://securityheaders.com (target grade A).

### Note on `frame-src`

`frame-src https://w.soundcloud.com` was added for the SoundCloud embed on a
planned `/rotation/` page. That page has been dropped (PR #2 closed
unmerged), so nothing on the site embeds a frame any more. Remove the source
from the Cloudflare rule so `frame-src` falls back to `default-src 'self'`,
then drop it from the value above.

## Inline script hashes

One inline `<script>` block needs allowing by hash in `script-src`.

**Theme paint (every page).** Reads the `pt_theme` cookie and sets the
initial theme before first paint:

```
'sha256-HlYZfhxwF3LSSm1p6LErAjcb16+zr+rCG8YAJsYLt2g='
```

The hash covers this exact script body:

```js
(function(){try{var m=document.cookie.match(/(?:^|;\s*)pt_theme=(light|dark)/);var t=m?m[1]:localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="light"||(!t&&!d))document.body.classList.add("light-mode");}catch(e){}})();
```

Change one byte of it and the hash must be recomputed and the Cloudflare rule
updated, or theming breaks site-wide.

## `connect-src` origins in use

`api.github.com` and `raw.githubusercontent.com`: the writeups reader's live
fallback and raw markdown bodies.

## DNS checklist

- Confirm SPF, DKIM, and DMARC (`p=reject` once aligned) for
  `paracausaltelemetry.com` mail.
- Add a `CAA` record pinning issuance to the CAs actually used (Cloudflare's
  edge certificates and GitHub Pages' Let's Encrypt).
- Enable DNSSEC if the registrar supports it.
