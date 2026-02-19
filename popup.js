document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loadingState');
  const results = document.getElementById('resultsState');

  const storage = await chrome.storage.local.get(['lastAudit']);
  if (storage.lastAudit) {
    renderUI(storage.lastAudit);
    loading.style.display = 'none';
    results.style.display = 'block';
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url.startsWith('http')) {
    document.querySelector('#loadingState div').innerText =
      "CANNOT ANALYZE SYSTEM PAGE";
    return;
  }

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: () => {
        const getBytes = (str) => new Blob([str]).size;

        const html = document.documentElement.outerHTML;

        let js = 0;
        document
          .querySelectorAll('script:not([src])')
          .forEach((s) => (js += getBytes(s.innerHTML)));

        let css = 0;
        document
          .querySelectorAll('style')
          .forEach((s) => (css += getBytes(s.innerHTML)));

        return {
          total: getBytes(html),
          head: getBytes(document.head.innerHTML),
          body: getBytes(document.body.innerHTML),
          scripts: js,
          styles: css
        };
      }
    },
    (resp) => {
      if (!resp || !resp[0] || !resp[0].result) return;

      const data = resp[0].result;
      chrome.storage.local.set({ lastAudit: data });

      setTimeout(() => {
        renderUI(data);

        loading.style.opacity = "0";
        setTimeout(() => {
          loading.style.display = "none";
          results.style.display = "block";
          results.style.opacity = "1";
        }, 300);
      }, 500);
    }
  );

  function renderUI(data) {
    const mbValue = data.total / (1024 * 1024);
    const kb = (b) => (b / 1024).toFixed(1) + " KB";

    animateCounter(mbValue);

    const bar = document.getElementById('progressBar');
    const status = document.getElementById('statusText');
    const alert = document.getElementById('actionAlert');

    // Dynamic scaling logic
    const scaleMax = mbValue > 4 ? Math.ceil(mbValue) : 4;
    const progressWidth = (mbValue / scaleMax) * 100;
    const limitMarkerPos = (2 / scaleMax) * 100; // FIXED HERE

    const limitLine = document.querySelector('.limit-line');
    const limitLabel = document.querySelector('.limit-label');

    if (limitLine && limitLabel) {
      limitLine.style.left = `${limitMarkerPos}%`;
      limitLabel.style.left = `${limitMarkerPos}%`;
    }

    bar.style.width = `${Math.min(progressWidth, 100)}%`;

    let alertClass = "alert-success";
    let statusMsg = "FULLY INDEXABLE";
    let glowColor = "#00ffd5";
    let recs = [];

    if (mbValue > 1.5) {
      if (mbValue > 2.0) {
        alertClass = "alert-danger";
        statusMsg = "CRITICAL: GOOGLEBOT TRUNCATION RISK";
        glowColor = "#ff0066";
      } else {
        alertClass = "alert-warning";
        statusMsg = "WARNING: APPROACHING 2MB LIMIT";
        glowColor = "#ffaa00";
      }

      if (data.scripts > 150 * 1024) {
        recs.push(
          `<strong>JS Bloat (${kb(data.scripts)}):</strong> Move inline scripts to external files & minify structured data.`
        );
      }

      if (data.styles > 75 * 1024) {
        recs.push(
          `<strong>CSS Bloat (${kb(data.styles)}):</strong> Extract inline styles to global CSS for caching efficiency.`
        );
      }

      if (data.body > 1.4 * 1024 * 1024) {
        recs.push(
          `<strong>DOM Density (${kb(data.body)}):</strong> Reduce nested containers & remove unused hidden markup.`
        );
      }

      if (data.head > 300 * 1024) {
        recs.push(
          `<strong>Head Overload (${kb(data.head)}):</strong> Audit meta duplication & inline SVG usage.`
        );
      }

      if (recs.length === 0) {
        recs.push(
          "<strong>General Optimization:</strong> Check for Base64 images or embedded SVG bloat."
        );
      }
    }

    status.innerText = statusMsg;
    status.style.color = glowColor;
    status.style.textShadow = `0 0 12px ${glowColor}`;

    bar.style.background = `linear-gradient(90deg, ${glowColor}, #00ffd5)`;
    bar.style.boxShadow = `0 0 15px ${glowColor}`;

    document.getElementById('bodySize').innerText = kb(data.body);
    document.getElementById('headSize').innerText = kb(data.head);
    document.getElementById('scriptSize').innerText = kb(data.scripts);
    document.getElementById('styleSize').innerText = kb(data.styles);

    alert.style.display = "block";
    alert.className = `alert ${alertClass}`;

    if (mbValue > 1.5) {
      alert.innerHTML =
        `<strong>Optimization Required:</strong><ul>` +
        recs.map((r) => `<li>${r}</li>`).join("") +
        `</ul>`;
    } else {
      alert.innerHTML =
        "<strong>Safe Status:</strong> HTML weight is optimized for Google’s 2MB crawl enforcement.";
    }
  }

  function animateCounter(finalValue) {
    const display = document.getElementById('sizeDisplay');
    let start = 0;
    const duration = 800;
    const increment = finalValue / (duration / 16);

    const counter = setInterval(() => {
      start += increment;
      if (start >= finalValue) {
        start = finalValue;
        clearInterval(counter);
      }
      display.innerHTML = `${start.toFixed(2)} <span style="font-size:20px">MB</span>`;
    }, 16);
  }
});
