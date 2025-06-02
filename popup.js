const siteList = document.getElementById("siteList");

chrome.storage.local.get("trackingMap", (data) => {
  const trackingMap = data.trackingMap || {};

  for (const origin in trackingMap) {
    const li = document.createElement("li");
    li.textContent = origin;

    const sublist = document.createElement("ul");
    sublist.style.display = "none";

    trackingMap[origin].forEach((target) => {
      const subItem = document.createElement("li");
      subItem.textContent = target;
      sublist.appendChild(subItem);
    });

    li.addEventListener("click", () => {
      sublist.style.display = sublist.style.display === "none" ? "block" : "none";
    });

    li.appendChild(sublist);
    siteList.appendChild(li);
  }
});
