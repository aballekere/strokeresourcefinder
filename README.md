# Stroke Resource Finder

Stroke Resource Finder is a small web app for stroke program counselors who need to make location-specific outreach brochures. A counselor enters a ZIP code, chooses resource categories, and gets a brochure-ready list of nearby services plus Area Deprivation Index (ADI) context.

The app is designed to work in several modes:

- **Demo mode:** uses sample resources and a placeholder ADI estimate so students and contributors can run it immediately.
- **Free-first mode:** uses counselor-approved resources, a local SQLite cache, and optional OpenStreetMap refresh.
- **Google fallback mode:** uses Google Places only when configured, preferably as a fallback for missing or weak free results.
- **Live ADI mode:** can call the R `sociome` package for ZIP/ZCTA-level ADI output.

## Why This Exists

Stroke outreach teams often table at community events and need resource lists tailored to where the event is happening. A generic handout is easy to make but less useful. This tool helps generate a local list of clinics, pharmacies, rehabilitation services, food assistance, transportation, senior services, libraries, and social-service navigation resources.

## What It Uses

- Node.js server with no required runtime dependencies
- Browser-based frontend in `public/`
- Local SQLite cache at `data/resources.sqlite`
- Optional OpenStreetMap/Nominatim/Overpass refresh for free place data
- Optional Google Places API for live place results
- Optional R bridge to [`ClevelandClinicQHS/sociome`](https://github.com/ClevelandClinicQHS/sociome) for ADI
- Local trusted-resource list in `data/trusted-resources.json`

Important geography note: ZIP codes and Census ZCTAs are not identical. For this outreach use case, ZCTA-level ADI is a practical approximation, but brochures should describe it as “area context” rather than a diagnosis of any person or household.

## Quick Start

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

The app works without API keys. It will show sample resources and clearly label them as sample data.

## Data Source Modes

For the detailed verification-first data plan, see [DATA_STRATEGY.md](DATA_STRATEGY.md).

The default is **free-first** mode:

```bash
RESOURCE_SOURCE=free
USE_OSM_OVERPASS=0
```

This uses:

- `data/trusted-resources.json`
- local SQLite cache at `data/resources.sqlite`
- sample data if no live/cache data exists

To enable free OpenStreetMap refreshes:

```bash
USE_OSM_OVERPASS=1
CACHE_TTL_DAYS=7
APP_USER_AGENT="StrokeResourceFinder/0.1 (+https://your-contact-page.example)"
```

OpenStreetMap public services are community-funded. Keep usage modest, cache results, use a real app/contact User-Agent, and provide attribution in production materials. The OSM fallback is intentionally restricted to physical infrastructure categories and filters out records without a street address.

The **Data source setup** panel in the app can switch OpenStreetMap refresh on/off and save that setting into `.env`.

## Public API Endpoints

Get resources and ADI context:

```text
GET /api/resources?zip=44106&radius_miles=5
```

Filter categories:

```text
GET /api/resources?zip=44106&radius_miles=5&categories=food,clinic,transport
```

Get app configuration:

```text
GET /api/config
```

Save local Google settings:

```text
POST /api/settings/google
```

Save free-data settings:

```text
POST /api/settings/free
```

These endpoints are intentionally simple so the app can be used by another website, a brochure generator, or a future mobile workflow.

## Live Google Places Setup

1. Create a Google Cloud project.
2. Enable **Places API (New)** and **Geocoding API**.
3. Create an API key.
4. Restrict the key by API and deployment environment.
5. Set environment variables:

```bash
export GOOGLE_MAPS_API_KEY="your-key"
export USE_GOOGLE_PLACES=1
export RESOURCE_SOURCE=auto
npm start
```

The key must stay on the server. Do not put it in frontend JavaScript.

The app includes a **Data source setup** panel where a local admin can paste a Google key, enable/disable Google Places, and choose:

- `free`: trusted list + SQLite cache + optional OpenStreetMap refresh
- `auto`: free path first, Google fallback when configured
- `google`: Google Places only

The API key is saved to `.env` and is never returned to the browser by `/api/config`.

Google Places content has attribution and caching rules. In production, include Google Maps attribution wherever Google-derived listings are displayed, and store only what the Google Maps Platform terms allow. The stable `place_id` can be stored and refreshed.

## Live ADI Setup With `sociome`

Install R dependencies:

```r
install.packages(c("sociome", "tidycensus"))
```

Set environment variables:

```bash
export CENSUS_API_KEY="your-census-key"
export USE_SOCIOME_ADI=1
npm start
```

The backend calls:

```bash
Rscript scripts/adi_sociome.R 44106 2022
```

If R or the needed packages are not available, the app falls back to demo ADI context.

## Trusted Resource List

Edit `data/trusted-resources.json` to add counselor-approved resources. These are included even when Google Places is disabled.

Use `"zipCodes": ["*"]` for statewide or national services such as 2-1-1.

Example:

```json
{
  "id": "trusted-example",
  "name": "Example Food Pantry",
  "category": "Food assistance",
  "address": "100 Main St, Cleveland, OH 44106",
  "phone": "(216) 555-0100",
  "website": "https://example.org",
  "zipCodes": ["44106"],
  "notes": "Call before visiting."
}
```

## Suggested GitHub Repo Structure

```text
.
├── data/
├── public/
├── scripts/
├── server.js
├── package.json
├── .env.example
└── README.md
```

The local `sociome/` clone is ignored by `.gitignore`; it is a reference dependency, not part of this app.

## Ideas for High School Student Testing

Students can make meaningful improvements without needing access to patient data.

- **Validate sample ZIP codes:** choose 5 ZIP codes, run the app, and check whether the listed services are plausible and close enough.
- **Call verification:** call public phone numbers from a test list and record whether each service is still open, has the right number, and accepts new clients.
- **Category quality review:** decide whether results belong in the selected category. For example, does a “rehab” result actually offer stroke-related PT/OT?
- **Accessibility check:** test keyboard navigation, color contrast, mobile layout, and print readability.
- **Brochure usability test:** give a printed page to a counselor and ask what is missing, confusing, or too small.
- **Distance sanity check:** compare a few distances with Google Maps manually.
- **Trusted-list cleanup:** add verified local resources and remove duplicates.
- **Plain-language review:** rewrite category names and notes so patients and families can understand them quickly.
- **Missing resource hunt:** identify resource types that matter after stroke, such as medication assistance, home health, durable medical equipment, caregiver support, benefits navigation, smoking cessation, blood pressure cuffs, and transportation.
- **Data freshness audit:** add a `lastVerified` field to trusted resources and create a monthly review checklist.

## Ideas for Student Improvements

- Add a “verified by counselor” badge for trusted resources.
- Add language filters, such as Spanish-speaking services.
- Add wheelchair-accessibility and transit-access notes.
- Add export to PDF or Word.
- Add an editable brochure title, event date, and contact person.
- Add resource scoring: closer distance, trusted source, phone present, website present.
- Add a simple admin page for editing trusted resources.
- Add automated tests for `/api/resources`.
- Add a “report incorrect listing” button.
- Add a map view, while preserving a clean print layout.

## Privacy and Safety

Do not enter patient names, medical record numbers, or private health information into this tool. It is meant for public outreach planning by location, not patient-specific care.

Resource lists should be reviewed before distribution. Public listings can be stale, and eligibility rules can change.
