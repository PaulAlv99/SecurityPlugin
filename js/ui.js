// ui.js - Shows tracked websites and their trackers

let untrustedTLDs = {};

// Load the list of risky TLDs from a file
async function loadUntrustedTLDs() {
  const response = await fetch('untrusted_tlds.json');
  untrustedTLDs = await response.json();
}

// Get the risk level for a site's TLD
function getTLDRisk(hostname) {
  const match = hostname.match(/(\.[a-zA-Z0-9]+)$/);
  if (match) {
    const tld = match[1].toLowerCase();
    return untrustedTLDs[tld] || 0;
  }
  return 0;
}

let blocklistDescriptions = {};

// Load tracker descriptions from a file
async function loadBlocklistDescriptions() {
  const response = await fetch('notrack_blocklist.json');
  const blocklist = await response.json();
  blocklist.forEach(entry => {
    if (entry.domain) {
      blocklistDescriptions[entry.domain.toLowerCase()] = entry.description;
    }
  });
}

// Get the main domain (root) from a hostname
function toRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) {
    return hostname;
  }
  const tld = parts[parts.length - 1].toLowerCase();
  if (['com', 'net', 'org'].includes(tld)) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

async function render() {
  // Get all data from storage
  const rawData = await storeChild.getAllVisible();
  // Map of parent sites to their trackers
  const parentMap = {};

  // Make sure each main site is in the map
  Object.keys(rawData).forEach((host) => {
    const parentKey = toRootDomain(host);
    if (rawData[host].firstParty) {
      if (!parentMap[parentKey]) {
        parentMap[parentKey] = new Set();
      }
    }
  });

  // Add third-party trackers to their parent sites
  Object.keys(rawData).forEach((host) => {
    if (!rawData[host].firstParty) {
      const trackerKey = toRootDomain(host);
      const parents = rawData[host].thirdParties || [];
      parents.forEach((parentHost) => {
        const parentKey = toRootDomain(parentHost);
        if (!parentMap[parentKey]) {
          parentMap[parentKey] = new Set();
        }
        parentMap[parentKey].add(trackerKey);
      });
    }
  });

  // Convert Sets to Arrays for easier use
  const normalizedData = {};
  Object.keys(parentMap).forEach((parent) => {
    normalizedData[parent] = {
      children: Array.from(parentMap[parent]),
    };
  });

  // Build the list in the UI
  const list = document.getElementById("trackerList");
  list.innerHTML = "";

  Object.keys(normalizedData).forEach((parent) => {
    // Main site line
    const li = document.createElement("li");
    li.style.marginBottom = "8px";

    const originDiv = document.createElement("div");
    originDiv.className = "origin";
    originDiv.style.fontWeight = "bold";
    originDiv.style.cursor = "pointer";
    originDiv.style.display = "flex";
    originDiv.style.justifyContent = "space-between";
    originDiv.style.alignItems = "center";

    const tldRisk = getTLDRisk(parent);

    const parentSpan = document.createElement("span");
    parentSpan.textContent = parent;

    const tldSpan = document.createElement("span");
    tldSpan.textContent = `TLDs Unsecure Level ${tldRisk}/10`;
    tldSpan.style.marginLeft = "auto";
    tldSpan.style.fontWeight = "normal";
    tldSpan.style.fontSize = "0.95em";
    tldSpan.style.color = "#888";

    originDiv.appendChild(parentSpan);
    originDiv.appendChild(tldSpan);

    // List of trackers for this site
    const nestedUl = document.createElement("ul");
    nestedUl.className = "targets";
    nestedUl.style.listStyleType = "disc";
    nestedUl.style.marginLeft = "20px";
    nestedUl.style.display = "none"; // hidden by default

    const childrenList = normalizedData[parent].children;
    if (childrenList.length > 0) {
      childrenList.forEach((trackerData) => {
        const trackerHost = trackerData.hostname || trackerData;
        const trackerDomain = toRootDomain(trackerHost).toLowerCase();

        // Show tracker name and description
        const trackerDiv = document.createElement("div");
        trackerDiv.style.display = "flex";
        trackerDiv.style.justifyContent = "space-between";
        trackerDiv.style.alignItems = "center";

        const trackerSpan = document.createElement("span");
        trackerSpan.textContent = trackerHost;

        const desc = blocklistDescriptions[trackerDomain];
        let descSpan = null;
        if (desc) {
          descSpan = document.createElement("span");
          descSpan.textContent = desc;
          descSpan.style.fontWeight = "normal";
          descSpan.style.fontSize = "0.95em";
          descSpan.style.color = "#888";
          descSpan.style.marginLeft = "auto";
        }

        trackerDiv.appendChild(trackerSpan);
        if (descSpan) trackerDiv.appendChild(descSpan);

        const trackerLi = document.createElement("li");
        trackerLi.appendChild(trackerDiv);

        // Highlight trackers based on their description
        if (desc) {
          if (/tracker/i.test(desc)) {
            trackerLi.classList.add("tracker-yellow");
          } else if (/advertising/i.test(desc)) {
            trackerLi.classList.add("tracker-pink");
          }
        }


        nestedUl.appendChild(trackerLi);
      });
    } else {
      // No trackers for this site
      const emptyLi = document.createElement("li");
      emptyLi.textContent = "(no third-party trackers)";
      emptyLi.style.fontStyle = "italic";
      nestedUl.appendChild(emptyLi);
    }

    // Click to show/hide trackers
    originDiv.addEventListener("click", () => {
      nestedUl.style.display =
        nestedUl.style.display === "none" ? "block" : "none";
    });

    li.appendChild(originDiv);
    li.appendChild(nestedUl);
    list.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // Load data files
  await loadUntrustedTLDs();
  await loadBlocklistDescriptions();

  // Show the list
  render();

  // Update the list when data changes
  storeChild.onUpdate(() => {
    render();
  });

  // Clear all data and refresh
  document.getElementById("clearBtn").addEventListener("click", async () => {
    await storeChild.reset();
    render();
  });
});

// Download all data as a JSON file
document.getElementById("downloadBtn").addEventListener("click", async () => {
  try {
    const rawData = await storeChild.getAllVisible();

    const grouped = {};

    Object.entries(rawData).forEach(([hostname, data]) => {
      const isUUID = /^[0-9a-fA-F\-]{36}$/.test(hostname);
      const displayName = isUUID ? `Unknown Host (${hostname})` : hostname;

      const trackerData = {
        hostname: hostname,
        favicon: data.favicon || "",
        isVisible: data.isVisible || 1,
        firstRequestTime: data.firstRequestTime || null,
        lastRequestTime: data.lastRequestTime || null
      };

      if (data.firstParty) {
        grouped[displayName] = {
          hostname: hostname,
          favicon: data.favicon || "",
          firstRequestTime: data.firstRequestTime || null,
          lastRequestTime: data.lastRequestTime || null,
          isVisible: data.isVisible || 1,
          thirdParties: []
        };
      }
      else {
        (data.thirdParties || []).forEach(parent => {
          const parentKey = /^[0-9a-fA-F\-]{36}$/.test(parent)
            ? `Unknown Host (${parent})`
            : parent;

          if (!grouped[parentKey]) {
            grouped[parentKey] = {
              hostname: parent,
              favicon: "",
              isVisible: 1,
              thirdParties: []
            };
          }

          grouped[parentKey].thirdParties.push(trackerData);
        });
      }
    });

    const json = JSON.stringify(grouped, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "grouped_websites.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Error exporting grouped tracker data:", err);
    alert("Failed to export grouped data.");
  }
});

// Load theme from localStorage
function applyTheme() {
  const isDark = localStorage.getItem("theme") === "dark";
  document.body.classList.toggle("dark-mode", isDark);

  const toggleButton = document.getElementById("themeToggle");
  toggleButton.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
}

document.getElementById("themeToggle").addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  applyTheme();
});

applyTheme();
