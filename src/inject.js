(function () {
  "use strict";
  console.log("[Loom Downloader] Simplified logger injected.");

  const originalFetch = window.fetch;

  window.fetch = function (...args) {
    const [url] = args;

    return originalFetch.apply(this, args).then(async (response) => {
      // We are looking for the API call that contains the video information.
      // Let's log all JSON responses to find the right one.
      if (response.headers.get("content-type")?.includes("json")) {
        const clonedResponse = response.clone();
        try {
          const json = await clonedResponse.json();
          console.log(`[Loom Downloader] JSON Response from ${url}:`, json);
        } catch (e) {
          // Ignore errors
        }
      }
      return response;
    });
  };
})();
