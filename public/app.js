const form = document.querySelector("#search-form");
const zipInput = document.querySelector("#zip");
const radiusInput = document.querySelector("#radius");
const filters = document.querySelector("#filters");
const resourcesEl = document.querySelector("#resources");
const template = document.querySelector("#resource-card-template");
const reviewTemplate = document.querySelector("#review-card-template");
const adiScore = document.querySelector("#adi-score");
const adiDetail = document.querySelector("#adi-detail");
const sourceTitle = document.querySelector("#source-title");
const sourceDetail = document.querySelector("#source-detail");
const resultsTitle = document.querySelector("#results-title");
const resultsCount = document.querySelector("#results-count");
const printButton = document.querySelector("#print-button");
const tabs = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");
const studentResourceForm = document.querySelector("#student-resource-form");
const resourceZip = document.querySelector("#resource-zip");
const resourceCategory = document.querySelector("#resource-category");
const studentResourceStatus = document.querySelector("#student-resource-status");
const adminReviewForm = document.querySelector("#admin-review-form");
const adminAccessToken = document.querySelector("#admin-access-token");
const adminReviewedBy = document.querySelector("#admin-reviewed-by");
const adminReviewStatus = document.querySelector("#admin-review-status");
const pendingResourcesEl = document.querySelector("#pending-resources");

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
  renderFilters();
  renderResourceCategoryOptions();
  await search();
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
  resultsCount.textContent = `${data.resources.length} listings from trusted lists or shared ZIP/category entries.`;
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
  adiScore.textContent = `sociome ADI score ${score}`;
  const referenceArea = adi.referenceArea ? ` Reference area: ${adi.referenceArea}.` : "";
  adiDetail.textContent = `${adi.geography} ${adi.zip}, ${adi.year}. Mean 100, SD 20.${referenceArea} Source: ${adi.source}`;
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
    renderContactLinks(contact, resource);

    resourcesEl.append(card);
  }
}

function renderPendingResources(resources) {
  pendingResourcesEl.replaceChildren();
  if (resources.length === 0) {
    adminReviewStatus.textContent = "No pending submissions.";
    return;
  }

  adminReviewStatus.textContent = `${resources.length} pending submission${resources.length === 1 ? "" : "s"}.`;
  for (const resource of resources) {
    const card = reviewTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = resource.id;
    card.querySelector(".category").textContent = resource.category || "Resource";
    card.querySelector(".source").textContent = resource.status || "pending";
    card.querySelector("h3").textContent = resource.name || "Unnamed resource";
    card.querySelector(".address").textContent = resource.address || "";
    card.querySelector(".notes").textContent = resource.notes || "";
    card.querySelector(".submitted-by").textContent = [
      resource.createdBy ? `Submitted by ${resource.createdBy}` : "",
      resource.zip ? `ZIP ${resource.zip}` : "",
      resource.fetchedAt ? `Submitted ${new Date(resource.fetchedAt).toLocaleString()}` : ""
    ].filter(Boolean).join(" · ");
    renderContactLinks(card.querySelector(".contact"), resource);
    for (const button of card.querySelectorAll("[data-review]")) {
      button.addEventListener("click", () => reviewResource(resource.id, button.dataset.review));
    }
    pendingResourcesEl.append(card);
  }
}

function renderContactLinks(contact, resource) {
  if (resource.phone) {
    const phone = document.createElement("a");
    phone.href = `tel:${resource.phone}`;
    phone.textContent = resource.phone;
    contact.append(phone);
  }
  if (resource.website) {
    const safeWebsite = safeHttpUrl(resource.website);
    if (safeWebsite) {
      const website = document.createElement("a");
      website.href = safeWebsite;
      website.target = "_blank";
      website.rel = "noreferrer";
      website.textContent = "Website";
      contact.append(website);
    }
  }
  if (resource.mapUrl) {
    const map = document.createElement("a");
    map.href = resource.mapUrl;
    map.target = "_blank";
    map.rel = "noreferrer";
    map.textContent = "Map";
    contact.append(map);
  }
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  search();
});

filters.addEventListener("change", search);
printButton.addEventListener("click", () => window.print());

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

  studentResourceStatus.textContent = `${result.resource.name} submitted for review.`;
  zipInput.value = result.resource.zip;
  resourceZip.value = result.resource.zip;
  activateTab("search-panel");
  await search();
});

adminReviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadPendingResources();
});

async function loadPendingResources() {
  adminReviewStatus.textContent = "Loading pending submissions...";
  const params = new URLSearchParams({ adminToken: adminAccessToken.value.trim() });
  const response = await fetch(`/api/admin/resources?${params}`);
  const result = await response.json();
  if (!response.ok) {
    pendingResourcesEl.replaceChildren();
    adminReviewStatus.textContent = result.error || "Could not load pending submissions.";
    return;
  }
  renderPendingResources(result.resources || []);
}

async function reviewResource(id, status) {
  adminReviewStatus.textContent = `${status === "approved" ? "Approving" : "Rejecting"} submission...`;
  const response = await fetch("/api/admin/resources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      adminToken: adminAccessToken.value.trim(),
      reviewedBy: adminReviewedBy.value.trim(),
      id,
      status
    })
  });
  const result = await response.json();
  if (!response.ok) {
    adminReviewStatus.textContent = result.error || "Could not update submission.";
    return;
  }
  await loadPendingResources();
  if (status === "approved") await search();
}

init();
