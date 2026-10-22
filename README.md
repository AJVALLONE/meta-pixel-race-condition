# Meta Pixel Race Condition Fix — GHL Funnel Interstitial Pages

Fixes a silent Meta pixel tracking failure that occurs when a GoHighLevel funnel page fires a conversion event and then redirects faster than GHL injects its client-side pixel code.

---

## The Problem

GoHighLevel injects the Meta base pixel (`fbevents.js`) client-side, approximately **5,000–5,500ms** after page load — after its own JavaScript hydration completes.

If your funnel page redirects in under ~5 seconds (a booking interstitial, a quiz results page, a thank-you redirect), your conversion event fires into a void:

```
DOM ready:              ~1,100 ms
Your fbq('track') runs: ~1,200 ms   ← typeof fbq === undefined, try/catch swallows it
GHL injects fbevents.js: ~5,200 ms  ← too late, page already navigated
```

**The result:** zero requests to `facebook.com`. Not a failed event — no pixel at all. Events Manager shows nothing. Meta has no signal to optimize against.

This failure is completely silent if your tracking code wraps the `fbq` call in `try/catch` (which it should, to protect the user journey). The catch block hides the failure and the redirect happens normally.

### Affected Page Types
- Booking interstitials (fires `Schedule`, then redirects to scheduler)
- Quiz results pages (fires `Lead`, then redirects to next step)
- Thank-you pages with auto-redirect
- Any page that fires a conversion event and navigates away in under ~5 seconds

---

## The Diagnosis

### How to confirm you have this bug

1. Open **Chrome DevTools → Network tab**, filter by `facebook.com`
2. Load the affected page
3. Watch for requests to `connect.facebook.net/en_US/fbevents.js` and `facebook.com/tr/`

**If you see zero facebook.com requests:** the pixel never loaded. This is the race condition.

**If you see fbevents.js load but no `/tr/` beacon:** the pixel loaded but your event call ran before `fbq.callMethod` was initialized. Less common with this fix applied.

### Confirm with Events Manager Test Events

1. Events Manager → Data Sources → your pixel → **Test Events**
2. Copy the test code snippet
3. Open your affected page URL with `?fbclid=TEST` appended
4. Watch the panel — if nothing appears within 30 seconds, the race condition is confirmed

---

## The Fix

Instead of waiting for GHL to inject the pixel, load `fbevents.js` yourself at the top of your script. Then hold the redirect until the pixel library has actually initialized (confirmed by `fbq.callMethod` existing), with a hard cap to protect user experience on slow connections.

### Files in this repo

| File | Purpose |
|------|---------|
| `booking-interstitial.html` | Complete drop-in HTML for a GHL booking interstitial page. Replace the 3 config variables at the top and paste into your GHL funnel page custom code block. |
| `pixel-fix.js` | Standalone configurable script — use this if you already have your own page markup and just need the pixel + redirect logic. |
| `diagnosis.md` | Step-by-step diagnosis guide for identifying this issue in any funnel. |

---

## How It Works

```javascript
// 1. Load fbevents.js inline — don't wait for GHL
!function(f,b,e,v,n,t,s){ ... }(window, document, 'script',
  'https://connect.facebook.net/en_US/fbevents.js');

// 2. Init pixel and fire event immediately
fbq('init', PIXEL_ID);
fbq('track', 'PageView');
fbq('track', 'Schedule', {}, { eventID: eventId });

// 3. Poll until fbq.callMethod exists (pixel truly loaded), then redirect
// Hard cap at 4s so slow connections still reach the destination
(function go() {
  var now = Date.now();
  if (!readyAt && window.fbq && window.fbq.callMethod) readyAt = now;
  if ((readyAt && now - readyAt >= SETTLE) || now - start >= CAP) {
    window.location.href = DESTINATION_URL;
  } else {
    setTimeout(go, 100);
  }
})();
```

**GHL's late injection doesn't conflict:** Meta's pixel snippet starts with `if(f.fbq)return;` — the second injection no-ops automatically.

---

## Event Deduplication

If you're also sending this event via CAPI (server-side), you **must** pass the same `eventID` in both the browser event and the server payload. Without a matching `eventID`, Meta counts them as two separate conversions and bids 2× as aggressively as it should.

This fix generates a unique `eventID` per page load:
```javascript
var eventId = 'sch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
```

Pass this same ID to your CAPI endpoint. If you're not using CAPI, ignore this.

---

## Privacy Architecture Note

This fix is designed for interstitial pages you control — **not** for third-party clinical, booking, or payment surfaces. Never load a tracking pixel on a page served by your EHR, telehealth platform, or payment processor. This interstitial pattern exists specifically to fire the conversion event from a page you own before handing off to a third-party URL.

---

## Real-World Context

This fix was developed while building a telehealth membership funnel on GoHighLevel with Healthie as the clinical platform. The `/booking` interstitial needed to:
1. Fire `Schedule` to Meta for campaign optimization
2. Avoid placing any pixel on the Healthie scheduler (clinical surface, PHI risk)
3. Redirect users within ~1.5 seconds so the experience felt seamless

The race condition was diagnosed by comparing pixel network requests on a page with a 5s+ dwell time (`/care`) vs. the interstitial (`/booking`). Zero facebook.com requests on the fast page confirmed the issue.

---

## License

MIT — use freely, adapt as needed.
