# Stroke Resource Finder

Stroke Resource Finder is a small web app for stroke program counselors who need to make location-specific outreach brochures. A counselor enters a ZIP code, chooses resource categories, and gets a brochure-ready list of nearby services plus Area Deprivation Index (ADI) context.

The app is designed to work in several modes:

- **Demo mode:** uses sample resources and a placeholder ADI estimate so students and contributors can run it immediately.
- **Free-first mode:** uses counselor-approved resources, a local SQLite cache, and optional OpenStreetMap refresh.
- **Shared classroom mode:** writes student-entered resources to Supabase so everyone contributes to one database.
- **Google fallback mode:** uses Google Places only when configured, preferably as a fallback for missing or weak free results.
- **Live ADI mode:** can call the R `sociome` package for ZIP/ZCTA-level ADI output.

## Why This Exists

Stroke outreach teams often table at community events and need resource lists tailored to where the event is happening. A generic handout is easy to make but less useful. This tool helps generate a local list of clinics, pharmacies, rehabilitation services, food assistance, transportation, senior services, libraries, and social-service navigation resources.

## What It Uses

- Node.js server with no required runtime dependencies
- Browser-based frontend in `public/`
- Local SQLite cache at `data/resources.sqlite`
- Optional Supabase Postgres database for shared student entries
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

Save a student-found resource:

```text
POST /api/resources/manual
```

These endpoints are intentionally simple so the app can be used by another website, a brochure generator, or a future mobile workflow.

## Shared Supabase + Vercel Setup

Use this path when students should all add resources to the same database.

### 1. Create the GitHub repo

Push this project to GitHub, for example:

```bash
git remote add origin https://github.com/aballekere/strokeresourcefinder.git
git push -u origin main
```

### 2. Create the Supabase table

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run the SQL in [`supabase/schema.sql`](supabase/schema.sql).
4. Go to **Project Settings > API**.
5. Copy:
   - Project URL
   - `service_role` key

Keep the `service_role` key private. It belongs only in server-side environment variables.

### 3. Deploy on Vercel

1. Import the GitHub repo into Vercel.
2. Add these environment variables:

```bash
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
RESOURCE_SOURCE=free
USE_OSM_OVERPASS=0
USE_GOOGLE_PLACES=0
USE_SOCIOME_ADI=0
```

3. Deploy.
4. Give students the Vercel URL, not local `localhost`.

On Vercel, the frontend in `public/` calls serverless API routes in `api/`. Student entries are written to Supabase through `/api/resources/manual`, then included in later `/api/resources` searches for the same ZIP/category.

When Supabase is configured, deployed searches do **not** show sample/mock resources. They show:

- counselor-maintained trusted resources from `data/trusted-resources.json`
- student-entered resources from Supabase `resources`
- ADI context from Supabase `adi_context`

### 4. Local testing with Supabase

Copy `.env.example` to `.env`, fill in the Supabase variables, then run:

```bash
npm start
```

If Supabase variables are missing, local student entries fall back to SQLite at `data/resources.sqlite`.

### 5. Load ADI context into Supabase

Vercel does not run R, so production ADI values should be precomputed with `sociome` and stored in Supabase.

The schema creates an `adi_context` table:

```text
zip
geography
reference_area
year
adi
financial_strength
economic_hardship_and_inequality
educational_attainment
source
updated_at
```

Example SQL for one ZIP:

```sql
insert into public.adi_context (
  zip,
  geography,
  reference_area,
  year,
  adi,
  financial_strength,
  economic_hardship_and_inequality,
  educational_attainment,
  source
) values (
  '44106',
  'ZCTA',
  'ZCTAs beginning with 441',
  2022,
  102.09,
  115.92,
  115.29,
  105.36,
  'sociome acs5'
)
on conflict (zip) do update set
  geography = excluded.geography,
  reference_area = excluded.reference_area,
  year = excluded.year,
  adi = excluded.adi,
  financial_strength = excluded.financial_strength,
  economic_hardship_and_inequality = excluded.economic_hardship_and_inequality,
  educational_attainment = excluded.educational_attainment,
  source = excluded.source,
  updated_at = now();
```

To generate real ADI seed SQL from the ZIPs already present in this project:

1. Get a free Census API key from <https://api.census.gov/data/key_signup.html>.
2. Set it locally:

```bash
export CENSUS_API_KEY="your-census-key"
```

3. Generate Supabase upsert SQL:

```bash
npm run adi:sql
```

That command reads ZIPs from:

- `data/trusted-resources.json`
- local SQLite `data/resources.sqlite`, if present
- any ZIPs passed as arguments

For example:

```bash
npm run adi:sql -- 44106 44118
```

The output is written to:

```text
supabase/adi_context_seed.sql
```

Review that file, then paste it into **Supabase > SQL Editor** and run it. The generated seed file is ignored by Git because it is environment/output data, not source code.

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
