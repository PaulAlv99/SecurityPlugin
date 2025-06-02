/* global storeChild, document */

/**
 * (Optional) A small helper to collapse “a1.nytimes.com” or “static01.nytimes.com”
 * down to “nytimes.com” if you want all subdomains to show up under a single root.
 *
 * If you do NOT need subdomain-normalization, you can skip calling this and just
 * use each hostname verbatim. If you do want to collapse all “.nytimes.com” into
 * a single entry, keep this function.
 */
function toRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) {
    // e.g. "canva.com" or "github.com" → leave as is
    return hostname;
  }
  const tld = parts[parts.length - 1].toLowerCase();
  // If it ends in .com / .net / .org, grab the last two segments
  if (['com', 'net', 'org'].includes(tld)) {
    return parts.slice(-2).join('.');
  }
  // Otherwise, do not try to be fancy—just return the full hostname
  return hostname;
}

async function render() {
  // 1️⃣ Fetch everything from the background
  const rawData = await storeChild.getAllVisible();
  // rawData is an object mapping each hostname → { favicon, thirdParties: [parents...], firstParty: bool }

  // 2️⃣ Build a “parent → Set of children” map
  //
  // We want something like:
  //    {
  //      "nytimes.com":  Set( "pagead2.googlesyndication.com", "c.go-mpulse.net", … ),
  //      "canva.com":    Set(), // if there are no trackers
  //      ...
  //    }
  //
  // Start with an empty object. We'll populate it in two passes.
  const parentMap = {};

  //  2a) First pass: ensure that every hostname marked firstParty ends up
  //      as a key in parentMap (with an empty Set so far).
  Object.keys(rawData).forEach((host) => {
    // Optionally normalize subdomain → root:
    const parentKey = toRootDomain(host);

    if (rawData[host].firstParty) {
      // If it’s a first-party host (e.g. “www.nytimes.com”), make sure we have a Set
      if (!parentMap[parentKey]) {
        parentMap[parentKey] = new Set();
      }
    }
  });

  //  2b) Second pass: for every hostname that is _not_ firstParty (i.e. a third-party),
  //      look at rawData[host].thirdParties, which is an ARRAY OF PARENTS that loaded it.
  //      For each parent in that array, add this host → that parent’s Set.
  Object.keys(rawData).forEach((host) => {
    if (!rawData[host].firstParty) {
      // This is a third-party hostname (e.g. “pagead2.googlesyndication.com”)
      const trackerKey = toRootDomain(host);
      const parents = rawData[host].thirdParties || [];
      parents.forEach((parentHost) => {
        const parentKey = toRootDomain(parentHost);
        // If we never saw this parent as a firstParty (maybe it was recorded as third-party itself),
        // create an entry so it still shows up in the UI—otherwise we’d never see “parent” at all.
        if (!parentMap[parentKey]) {
          parentMap[parentKey] = new Set();
        }
        parentMap[parentKey].add(trackerKey);
      });
    }
  });

  // 3️⃣ Convert each Set back to an Array for easier rendering
  const normalizedData = {};
  Object.keys(parentMap).forEach((parent) => {
    normalizedData[parent] = {
      children: Array.from(parentMap[parent]), // third-party list
    };
  });
  //
  // normalizedData now looks like:
  // {
  //   "nytimes.com": { children: [ "pagead2.googlesyndication.com", "c.go-mpulse.net", … ] },
  //   "canva.com":   { children: [] },
  //   "example.org": { children: [ "tracker.example.net" ] },
  //   ...
  // }

  // 4️⃣ Build the <ul> in the DOM so that each “parent” appears as a top-level <li>,
  //     and all of its “children” (trackers) are nested underneath.
  const list = document.getElementById("trackerList");
  list.innerHTML = "";

  Object.keys(normalizedData).forEach((parent) => {
    // Create the top-level <li> for this first-party
    const li = document.createElement("li");
    li.style.marginBottom = "8px";

    // 4a) The clickable “origin” line (e.g. "nytimes.com")
    const originDiv = document.createElement("div");
    originDiv.textContent = parent;
    originDiv.className = "origin";
    originDiv.style.fontWeight = "bold";
    originDiv.style.cursor = "pointer";

    // 4b) The nested <ul> of all its third-party trackers
    const nestedUl = document.createElement("ul");
    nestedUl.className = "targets";
    nestedUl.style.listStyleType = "disc";
    nestedUl.style.marginLeft = "20px";
    nestedUl.style.display = "none"; // hide until clicked

    const childrenList = normalizedData[parent].children;
    if (childrenList.length > 0) {
      childrenList.forEach((trackerHost) => {
        const trackerLi = document.createElement("li");
        trackerLi.textContent = trackerHost;
        nestedUl.appendChild(trackerLi);
      });
    } else {
      // If there are no trackers for this parent, show a placeholder
      const emptyLi = document.createElement("li");
      emptyLi.textContent = "(no third-party trackers)";
      emptyLi.style.fontStyle = "italic";
      nestedUl.appendChild(emptyLi);
    }

    // 4c) When you click on the “origin” line, toggle the nested list
    originDiv.addEventListener("click", () => {
      nestedUl.style.display =
        nestedUl.style.display === "none" ? "block" : "none";
    });

    li.appendChild(originDiv);
    li.appendChild(nestedUl);
    list.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Initial render
  render();

  // Re-render whenever the background broadcasts a change
  storeChild.onUpdate(() => {
    render();
  });

  // “Clear All” button: clear the entire DB in the background, then re-render
  document.getElementById("clearBtn").addEventListener("click", async () => {
    await storeChild.reset();
    render();
  });
});
document.getElementById("download").addEventListener("click", async () => {
    try {
        const data = await storeChild.getAllVisible();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "tracked_websites.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Error downloading tracker data:", err);
        alert("Failed to download tracker data.");
    }
});

