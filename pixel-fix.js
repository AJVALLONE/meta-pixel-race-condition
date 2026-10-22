/**
 * Meta Pixel Race Condition Fix
 * ─────────────────────────────────────────────────────────────────────────────
 * Use on any GoHighLevel funnel page that fires a Meta conversion event
 * and then redirects before GHL's client-side pixel injection (~5,200ms).
 *
 * DROP-IN USAGE
 * Replace the three config values below and paste this script into your
 * GHL page's custom code block. Keep your existing markup above it.
 *
 * WHAT IT DOES
 * 1. Loads fbevents.js immediately (instead of waiting for GHL)
 * 2. Inits the pixel, fires PageView + your conversion event
 * 3. Polls until fbq.callMethod exists (confirms pixel truly loaded)
 * 4. Redirects — typical delay ~1s, hard cap 4s for slow connections
 *
 * GHL's own late injection won't conflict — Meta's snippet has a built-in
 * guard: `if(f.fbq)return;` — the second init is a no-op.
 */

(function () {

  // ─── CONFIG ──────────────────────────────────────────────────────────────
  var PIXEL_ID      = 'YOUR_PIXEL_ID';          // e.g. '1923561565250552'
  var EVENT_NAME    = 'Schedule';                // e.g. 'Schedule', 'Lead', 'CompleteRegistration'
  var REDIRECT_URL  = 'YOUR_DESTINATION_URL';   // URL to navigate to after event fires
  // ─────────────────────────────────────────────────────────────────────────

  var SETTLE_MS = 600;   // ms to wait after fbq.callMethod is confirmed
  var CAP_MS    = 4000;  // hard cap — redirect regardless of pixel state

  // Unique event ID for deduplication (required if you also use CAPI)
  var eventId = 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

  // Load Meta base pixel inline — don't wait for GHL
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  // Fire events
  try {
    fbq('init', PIXEL_ID);
    fbq('track', 'PageView');
    fbq('track', EVENT_NAME, {}, { eventID: eventId });
  } catch (e) {
    // Silent fail — user journey is protected, redirect still happens below
  }

  // Wire up fallback link if present in your markup
  var fallbackLink = document.getElementById('redirectFallback');
  if (fallbackLink) fallbackLink.setAttribute('href', REDIRECT_URL);

  // Poll until pixel has truly loaded, then redirect
  var start   = Date.now();
  var readyAt = null;

  (function poll() {
    var now = Date.now();

    if (!readyAt && window.fbq && window.fbq.callMethod) {
      readyAt = now; // pixel library confirmed loaded
    }

    var settled   = readyAt && (now - readyAt >= SETTLE_MS);
    var timedOut  = (now - start) >= CAP_MS;

    if (settled || timedOut) {
      window.location.href = REDIRECT_URL;
    } else {
      setTimeout(poll, 100);
    }
  })();

})();
