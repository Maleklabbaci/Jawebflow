// JawebFlow Extreme Tracking - Lightweight Event Tracker
(function() {
  var assistantId = window.JAWEBFLOW_ASSISTANT_ID || null;
  var apiHost = window.JAWEBFLOW_API_HOST || 'https://votre-plateforme.com';

  function trackEvent(eventType, label) {
    if (!assistantId) return;
    
    // Fallback URL for development or generic usage
    if (apiHost === 'https://votre-plateforme.com') {
      apiHost = window.location.origin;
    }

    try {
      fetch(apiHost + '/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: assistantId,
          eventType: eventType,
          label: label,
          page: window.location.pathname,
          timestamp: new Date().toISOString()
        })
      }).catch(function(e) { /* silent fail */ });
    } catch(e) { /* silent fail */ }
  }

  // Setup generic click tracking
  document.addEventListener('click', function(e) {
    var target = e.target;
    var maxDepth = 4;
    var currentDepth = 0;

    while (target && target !== document && currentDepth < maxDepth) {
      if (
        target.tagName === 'BUTTON' || 
        target.tagName === 'A' || 
        (target.className && typeof target.className === 'string' && (target.className.indexOf('btn') > -1 || target.className.indexOf('button') > -1))
      ) {
        var label = target.innerText || target.getAttribute('aria-label') || target.title || 'Interaction';
        label = label.replace(/\s+/g, ' ').substring(0, 50).trim();
        if (label) {
          trackEvent('button_click', label);
          break;
        }
      }
      target = target.parentNode;
      currentDepth++;
    }
  });
})();
