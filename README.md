# Stroke Resource Finder

Stroke Resource Finder is a small web app for stroke program counselors who need to make location-specific outreach brochures. A counselor enters a ZIP code, chooses resource categories, and gets a brochure-ready list of nearby services plus Area Deprivation Index (ADI) context.

For a full adaptation checklist for another stroke program, see [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md).

The app is designed to work in two main modes:

- **Demo mode:** uses sample resources and a placeholder ADI estimate so students and contributors can run it immediately.
- **Shared classroom mode:** deploys on Vercel, writes student-entered resources to Supabase, and reads precomputed `sociome` ADI context from Supabase.

Local development also supports SQLite fallback and optional live data experiments, but production should use Supabase for persistence.

## Why This Exists

Stroke outreach teams often table at community events and need resource lists tailored to where the event is happening. A generic handout is easy to make but less useful. This tool helps generate a local list of clinics, pharmacies, rehabilitation services, food assistance, transportation, senior services, libraries, and social-service navigation resources.

## What It Uses

- Node.js server with no required runtime dependencies
- Browser-based frontend in `public/`
- Supabase Postgres database for shared student entries and ADI context
- Optional local SQLite cache at `data/resources.sqlite` for development only
- Optional local Google/OSM experiments through server-side environment variables
- Optional R bridge to [`ClevelandClinicQHS/sociome`](https://github.com/ClevelandClinicQHS/sociome) for ADI
- Local trusted-resource list in `data/trusted-resources.json`

Important geography note: ZIP codes and Census ZCTAs are not identical. For this outreach use case, ZCTA-level ADI is a practical approximation, but brochures should describe it as “area context” rather than a diagnosis of any person or household.

## Quick Start

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

The app works locally without API keys. It will show sample resources and clearly label them as sample data.

## Public Deployment

For a student-facing deployment, use Vercel + Supabase. Do not rely on SQLite in Vercel; serverless file storage is ephemeral and can disappear when functions idle, scale, or redeploy.

For the detailed verification-first data plan, see [DATA_STRATEGY.md](DATA_STRATEGY.md).

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

Local Google settings endpoint. This is for local development only; deployed Vercel settings should be managed with environment variables:

```text
POST /api/settings/google
```

Local free-data settings endpoint. This is for local development only:

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

Push this project to GitHub:

```bash
git remote add origin <your-github-repo-url>
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
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
STUDENT_ACCESS_TOKEN=<choose-a-private-student-submit-code>
ADMIN_ACCESS_TOKEN=<choose-a-private-coordinator-review-code>
RESOURCE_SOURCE=free
USE_OSM_OVERPASS=0
USE_GOOGLE_PLACES=0
USE_SOCIOME_ADI=0
```

3. Deploy.
4. Give students the Vercel URL, not local `localhost`.

On Vercel, the frontend in `public/` calls serverless API routes in `api/`. Student entries are written to Supabase through `/api/resources/manual`, then included in later `/api/resources` searches for the same ZIP/category.

Set `STUDENT_ACCESS_TOKEN` in Vercel to require a shared class passcode before `/api/resources/manual` accepts a write. Do not publish this passcode in GitHub.

Do not use the literal placeholder text above as the passcode. Choose a real private value and rotate it if it is accidentally shared.

Set `ADMIN_ACCESS_TOKEN` in Vercel to require a coordinator passcode before the **Review submissions** tab can approve or reject student submissions.

When Supabase is configured, deployed searches do **not** show sample/mock resources. They show:

- counselor-maintained trusted resources from `data/trusted-resources.json`
- approved student-entered resources from Supabase `resources`
- ADI context from Supabase `adi_context`

New student submissions are saved as `pending` and do not appear in search until a coordinator approves them.

### 4. Local testing with Supabase

Copy `.env.example` to `.env`, fill in the Supabase variables, then run:

```bash
npm start
```

If Supabase variables are missing, local student entries fall back to SQLite at `data/resources.sqlite`. This fallback is for local development only; do not rely on SQLite for Vercel persistence.

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

Or use the included Cleveland/Cuyahoga ZIP list:

```bash
npm run adi:sql -- --file data/cleveland-cuyahoga-zips.txt
```

The output is written to:

```text
supabase/adi_context_seed.sql
```

Review that file, then paste it into **Supabase > SQL Editor** and run it. The generated seed file is ignored by Git because it is environment/output data, not source code.

## Optional Local Google Places Setup

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

Google settings should be managed through server-side environment variables. Do not collect Google API keys in the public browser UI or store them in localStorage.

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

## Public Repo Safety

This repository intentionally excludes:

- `.env`
- `data/resources.sqlite`
- generated ADI seed SQL
- local R libraries and local `sociome/` clones

Keep Supabase service keys, Census API keys, Google API keys, and student access passcodes in Vercel or local `.env` only.

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
