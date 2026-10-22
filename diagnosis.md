# Diagnosis Guide — Meta Pixel Race Condition on Fast-Redirect Pages

Use this to determine whether any funnel page has the race condition before debugging further.

---

## Step 1 — Check the Network Tab

1. Open Chrome DevTools (`F12` or `Cmd+Option+I`)
2. Go to the **Network** tab
3. In the filter box, type `facebook`
4. Hard-reload the affected page (`Shift+Reload` or `Cmd+Shift+R`)
5. Watch requests as the page loads and redirects

### What you're looking for

| What you see | What it means |
|---|---|
| `fbevents.js` loads + `/tr/` beacon fires before redirect | ✅ Pixel is working correctly |
| `fbevents.js` loads but no `/tr/` beacon before redirect | ⚠️ Pixel loaded but event call ran before `fbq.callMethod` initialized |
| Zero `facebook.com` requests before redirect | ❌ Race condition confirmed — pixel never had a chance to load |
| `fbevents.js` starts loading but doesn't complete before redirect | ❌ Race condition — library request interrupted by navigation |

---

## Step 2 — Compare Timing

In the Network tab, note the timestamp of each request:

```
[0ms]      Navigation starts
[~300ms]   Your page HTML loads
[~1,200ms] Your fbq('track') call runs  ← is fbq defined here?
[~5,200ms] GHL injects fbevents.js      ← too late if redirect already happened
```

If your page redirects at or before ~5,000ms, GHL's pixel will never fire on it.

To check your GHL injection timing without triggering a redirect, temporarily comment out the `window.location.href` line, reload, and watch when `fbevents.js` appears in the Network tab.

---

## Step 3 — Events Manager Test Events

This is the definitive test.

1. Go to **Events Manager → Data Sources → [your pixel] → Test Events**
2. Copy the test browser code (you'll see it on screen)
3. Open your affected page URL with `?fbclid=TEST` appended
4. Watch the Events Manager panel

### Pass criteria
- ✅ Your event name appears within 30 seconds
- ✅ Source shows `Browser`
- ✅ `eventID` is present (format: `sch_...` or `evt_...`)
- ✅ No duplicate-event warning
- ✅ Count is exactly 1 per page visit

### Failure
- ❌ Nothing appears → race condition confirmed, or pixel not on page at all
- ❌ Event appears but `eventID` is missing → deduplication will fail if you use CAPI
- ❌ Event appears twice → duplicate pixel injection (check for two published workflows)

---

## Step 4 — Identify All Affected Pages

Any page that redirects in under ~5 seconds is potentially affected. Common culprits:

- **Booking interstitials** — fires `Schedule`, redirects to scheduler
- **Quiz results pages** — fires `Lead`, redirects to next step or offer page
- **Opt-in confirmation pages** — fires `CompleteRegistration`, redirects to thank-you
- **Upsell accept/decline pages** — fires purchase events, redirects forward in funnel
- **Any "loading..." or "one moment..." page** with auto-redirect

Check each one with the Network tab method above.

---

## Step 5 — Check for Duplicate Workflow Publishing (GHL-specific)

If you see an event fire twice in Events Manager Test Events:

1. In GHL, go to **Automation → Workflows**
2. Search for any workflow that touches the affected page or tag
3. Check if you have two published versions of the same workflow
4. The duplicate fires the tag/event twice → Meta sees two conversions → bids 2× too high

One published workflow per trigger is the correct state.

---

## Step 6 — Verify AEM Event Ranking

After fixing and confirming the event fires:

1. Events Manager → your domain → **Aggregated Event Measurement**
2. The fixed event (e.g., `Schedule`) should be ranked **#1** — your primary optimization signal
3. If stale events (`AddToCart`, `InitiateCheckout`) are ranked higher and don't belong to your funnel, remove them from AEM to keep your dataset clean

---

## Quick Reference — GHL Injection Timing

Observed across multiple GHL funnel page types (2024–2025):

| Page type | Typical GHL pixel injection delay |
|---|---|
| Standard funnel page (no redirect) | ~5,000–5,500ms |
| Order form page | ~4,500–5,200ms |
| Custom code block page | ~5,000–6,000ms |

If your redirect fires before these thresholds, load the pixel yourself inline. See `pixel-fix.js` or `booking-interstitial.html` in this repo.
