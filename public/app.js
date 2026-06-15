const form = document.querySelector("#search-form");
const zipInput = document.querySelector("#zip");
const radiusInput = document.querySelector("#radius");
const filters = document.querySelector("#filters");
const resourcesEl = document.querySelector("#resources");
const template = document.querySelector("#resource-card-template");
const adiScore = document.querySelector("#adi-score");
const adiDetail = document.querySelector("#adi-detail");
const sourceTitle = document.querySelector("#source-title");
const sourceDetail = document.querySelector("#source-detail");
const resultsTitle = document.querySelector("#results-title");
const resultsCount = document.querySelector("#results-count");
const printButton = document.querySelector("#print-button");
const freeDataStatus = document.querySelector("#free-data-status");
const googleSettingsForm = document.querySelector("#google-settings-form");
const googleApiKey = document.querySelector("#google-api-key");
const googleEnabled = document.querySelector("#google-enabled");
const sourceMode = document.querySelector("#source-mode");
const googleSettingsStatus = document.querySelector("#google-settings-status");
const freeSettingsForm = document.querySelector("#free-settings-form");
const osmEnabled = document.querySelector("#osm-enabled");
const tabs = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");
const studentResourceForm = document.querySelector("#student-resource-form");
const resourceZip = document.querySelector("#resource-zip");
const resourceCategory = document.querySelector("#resource-category");
const studentResourceStatus = document.querySelector("#student-resource-status");

let categories = [];
let appConfig = {};

async function init() {
  if (window.location.protocol === "file:") {
    sourceTitle.textContent = "Server required";
    sourceDetail.textContent = "Start the app with npm start and open http://127.0.0.1:3000 instead of this file.";
    resultsCount.textContent = "The student entry tab and resource search need the local API server.";
    return;
  }

  const response = await fetch("/api/config");
  appConfig = await response.json();
  categories = appConfig.categories;
  renderSetupStatus();
  renderFilters();
  renderResourceCategoryOptions();
  await search();
}

function renderSetupStatus() {
  sourceMode.value = appConfig.sourceMode || "free";
  googleEnabled.checked = Boolean(appConfig.liveGoogleEnabled);
  osmEnabled.checked = Boolean(appConfig.liveOsmEnabled);
  freeDataStatus.textContent = [
    appConfig.sqliteCacheEnabled ? "SQLite cache ready" : "SQLite cache unavailable",
    appConfig.liveOsmEnabled ? "OSM refresh enabled" : "OSM refresh off",
    `cache TTL ${appConfig.cacheTtlDays || 7} days`
  ].join(" · ");
  googleSettingsStatus.textContent = appConfig.googleConfigured
    ? "Google key is saved. Choose a mode and enable/disable Places as needed."
    : "No Google key saved. Free mode will use trusted resources, cache, OSM if enabled, then sample data.";
}

function renderFilters() {
  filters.replaceChildren();
  for (const category of categories) {
    const label = document.createElement("label");
    label.className = "filter-pill";
    label.innerHTML = `<input type="checkbox" value="${category.key}" checked> ${category.label}`;
    filters.append(label);
  }
}

function renderResourceCategoryOptions() {
  resourceCategory.replaceChildren();
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category.key;
    option.textContent = category.label;
    resourceCategory.append(option);
  }
}

function selectedCategories() {
  return [...filters.querySelectorAll("input:checked")].map((input) => input.value);
}

function activateTab(panelId) {
  for (const button of tabs) {
    button.classList.toggle("active", button.dataset.tab === panelId);
  }
  for (const panel of tabPanels) {
    panel.hidden = panel.id !== panelId;
  }
}

async function search() {
  const zip = zipInput.value.trim();
  const radius = radiusInput.value;
  if (!/^\d{5}$/.test(zip)) return;

  setLoading(zip);
  const params = new URLSearchParams({
    zip,
    radius_miles: radius,
    categories: selectedCategories().join(",")
  });

  const response = await fetch(`/api/resources?${params}`);
  const data = await response.json();
  if (!response.ok) {
    sourceTitle.textContent = "Search failed";
    sourceDetail.textContent = data.error || "Unable to load resources.";
    resourcesEl.replaceChildren();
    return;
  }

  renderAdi(data.adi);
  renderResources(data.resources);
  resultsTitle.textContent = `Resources near ${data.zip}`;
  resultsCount.textContent = `${data.resources.length} listings within ${data.radiusMiles} miles or from trusted lists.`;
  sourceTitle.textContent = data.source;
  sourceDetail.textContent = `Updated ${new Date(data.generatedAt).toLocaleString()}`;
}

function setLoading(zip) {
  adiScore.textContent = "Loading ADI";
  adiDetail.textContent = `Checking context for ${zip}.`;
  sourceTitle.textContent = "Searching";
  sourceDetail.textContent = "Pulling trusted and place-based resources.";
  resourcesEl.replaceChildren();
}

function renderAdi(adi) {
  if (!adi?.ok) {
    adiScore.textContent = "ADI unavailable";
    adiDetail.textContent = adi?.error || "No context returned.";
    return;
  }

  const score = Number.isFinite(Number(adi.adi)) ? Number(adi.adi).toFixed(1) : "N/A";
  adiScore.textContent = `ADI ${score}`;
  adiDetail.textContent = `${adi.geography} ${adi.zip}, ${adi.year}. Source: ${adi.source}`;
}

function renderResources(resources) {
  resourcesEl.replaceChildren();
  for (const resource of resources) {
    const card = template.content.firstElementChild.cloneNode(true);
    card.querySelector(".category").textContent = resource.category || "Resource";
    card.querySelector(".distance").textContent =
      resource.distanceMiles == null ? "" : `${resource.distanceMiles} mi`;
    card.querySelector("h3").textContent = resource.name || "Unnamed resource";
    card.querySelector(".address").textContent = resource.address || "";
    card.querySelector(".notes").textContent = resource.notes || "";
    card.querySelector(".source").textContent = resource.source || "";

    const contact = card.querySelector(".contact");
    if (resource.phone) {
      const phone = document.createElement("a");
      phone.href = `tel:${resource.phone}`;
      phone.textContent = resource.phone;
      contact.append(phone);
    }
    if (resource.website) {
      const website = document.createElement("a");
      website.href = resource.website;
      website.target = "_blank";
      website.rel = "noreferrer";
      website.textContent = "Website";
      contact.append(website);
    }
    if (resource.mapUrl) {
      const map = document.createElement("a");
      map.href = resource.mapUrl;
      map.target = "_blank";
      map.rel = "noreferrer";
      map.textContent = "Map";
      contact.append(map);
    }

    resourcesEl.append(card);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  search();
});

filters.addEventListener("change", search);
printButton.addEventListener("click", () => window.print());
googleSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  googleSettingsStatus.textContent = "Saving settings...";
  const response = await fetch("/api/settings/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apiKey: googleApiKey.value.trim(),
      enabled: googleEnabled.checked,
      sourceMode: sourceMode.value
    })
  });
  const result = await response.json();
  if (!response.ok) {
    googleSettingsStatus.textContent = result.error || "Could not save settings.";
    return;
  }
  googleApiKey.value = "";
  appConfig = { ...appConfig, ...result };
  renderSetupStatus();
  await search();
});
freeSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  freeDataStatus.textContent = "Saving free-data settings...";
  const response = await fetch("/api/settings/free", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ osmEnabled: osmEnabled.checked })
  });
  const result = await response.json();
  if (!response.ok) {
    freeDataStatus.textContent = result.error || "Could not save free-data settings.";
    return;
  }
  appConfig = { ...appConfig, ...result };
  renderSetupStatus();
  await search();
});

for (const tab of tabs) {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
}

studentResourceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  studentResourceStatus.textContent = "Saving resource...";
  const formData = new FormData(studentResourceForm);
  const payload = Object.fromEntries(formData.entries());

  const response = await fetch("/api/resources/manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) {
    studentResourceStatus.textContent = result.error || "Could not save resource.";
    return;
  }

  studentResourceStatus.textContent = `${result.resource.name} saved for ${result.resource.zip}.`;
  zipInput.value = result.resource.zip;
  resourceZip.value = result.resource.zip;
  activateTab("search-panel");
  await search();
});

init();
