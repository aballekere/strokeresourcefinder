# Stroke Resource Finder Implementation Guide

This guide explains how another stroke program can adapt this project for its own region.

## What This App Is

Stroke Resource Finder is a lightweight resource-list builder for stroke outreach teams. It lets a coordinator or student:

- search by ZIP code
- filter resource categories
- view area context from precomputed `sociome` ADI values
- submit new community resources
- review student submissions before they appear publicly
- print a brochure-style resource list

The production architecture is:

```text
Browser UI -> Vercel serverless API -> Supabase Postgres
```

Do not use local SQLite for production on Vercel. Vercel serverless file storage is ephemeral.

## Roles

### Students

Students can search resources and submit candidate listings. To submit a resource they need the shared student passcode:

```text
STUDENT_ACCESS_TOKEN
```

Student submissions are saved with:

```text
status = pending
```

Pending submissions do not appear in public search results.

### Coordinators

Coordinators use the **Review submissions** tab. They need the admin passcode:

```text
ADMIN_ACCESS_TOKEN
```

Coordinators can approve or reject pending resources.

Approved resources appear in search results:

```text
status = approved
```

Rejected resources stay in the database for audit/history but do not appear in search.

## Adapting For A New Stroke Program

### 1. Fork Or Copy The Repository

Create a new GitHub repo for the program, for example:

```text
akron-stroke-resource-finder
central-ohio-stroke-resources
```

Do not commit secrets. Keep `.env`, database dumps, generated ADI seed files, and API keys out of Git.

### 2. Define The Service Area

Create a ZIP list in `data/`, for example:

```text
data/akron-summit-zips.txt
```

One ZIP per line:

```text
44301
44302
44303
```

Then generate ADI seed SQL for that list:

```bash
export CENSUS_API_KEY="<your-census-key>"
npm run adi:sql -- --file data/akron-summit-zips.txt
```

The output is:

```text
supabase/adi_context_seed.sql
```

Paste it into Supabase SQL Editor.

### 3. Update Trusted Resources

Edit:

```text
data/trusted-resources.json
```

Trusted resources are coordinator-approved resources that appear immediately. Use these for:

- stroke support groups
- hospital programs
- local food-bank navigators
- transportation contacts
- Area Agency on Aging entries
- statewide/national helplines

Use:

```json
"zipCodes": ["*"]
```

for statewide or national services.

Use explicit ZIPs for local resources:

```json
"zipCodes": ["44106", "44108"]
```

Recommended fields:

```json
{
  "id": "trusted-example",
  "name": "Example Stroke Support Group",
  "category": "Senior services",
  "address": "100 Main St, City, ST 12345",
  "phone": "(555) 555-0100",
  "website": "https://example.org",
  "zipCodes": ["12345"],
  "notes": "Call before attending.",
  "lastVerified": "2026-06-15",
  "verifiedBy": "Coordinator initials"
}
```

### 4. Create Supabase Tables

In Supabase SQL Editor, run:

```text
supabase/schema.sql
```

This creates:

- `resources`
- `adi_context`

The `resources` table includes review fields:

```text
status
reviewed_by
reviewed_at
```

If the table already exists from an older version, rerunning `schema.sql` is safe. It uses `if not exists` migrations for the added columns.

### 5. Configure Vercel Environment Variables

Set these in Vercel:

```bash
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
STUDENT_ACCESS_TOKEN=<private-student-submit-code>
ADMIN_ACCESS_TOKEN=<private-coordinator-review-code>
RESOURCE_SOURCE=free
USE_OSM_OVERPASS=0
USE_GOOGLE_PLACES=0
USE_SOCIOME_ADI=0
```

Use real private values for the two access tokens. Do not use placeholder text like `<private-student-submit-code>`.

### 6. Deploy On Vercel

Import the GitHub repo into Vercel and deploy.

After deployment:

1. Open `/api/config`.
2. Confirm:

```json
"supabaseEnabled": true
```

3. Confirm:

```json
"studentAccessRequired": true
```

4. Confirm:

```json
"adminAccessRequired": true
```

### 7. Student Workflow

Students:

1. Open the Vercel URL.
2. Go to **Add student resource**.
3. Enter the class access code.
4. Add public resource information.
5. Submit.

They should not enter patient names, MRNs, private phone numbers, or private medical details.

### 8. Coordinator Review Workflow

Coordinator:

1. Open the Vercel URL.
2. Go to **Review submissions**.
3. Enter the admin access code.
4. Load pending submissions.
5. Verify the resource externally.
6. Approve or reject.

Only approved resources appear in ZIP searches.

## Safety Checklist

Before sharing with students:

- `STUDENT_ACCESS_TOKEN` is set in Vercel.
- `ADMIN_ACCESS_TOKEN` is set in Vercel.
- Supabase `resources` table exists.
- Supabase `adi_context` table exists.
- ADI seed SQL has been run for the service-area ZIPs.
- Trusted resources have been reviewed.
- Public URL does not expose API keys.
- Students understand: public resource data only, no patient data.

## Customizing Categories

Categories live in:

```text
lib/supabaseResources.js
```

Update `resourceQueries` and `categoryAliases` if the program needs categories such as:

- Durable medical equipment
- Medication assistance
- Blood pressure cuffs
- Home health
- Caregiver support
- Aphasia groups
- Smoking cessation

If you add categories, also review existing trusted resources so their category text matches the new filters.

## Updating ADI Later

To refresh ADI for the same region:

```bash
export CENSUS_API_KEY="<your-census-key>"
npm run adi:sql -- --file data/cleveland-cuyahoga-zips.txt
```

Paste the regenerated SQL into Supabase SQL Editor. The seed file uses `on conflict (zip) do update`, so rerunning it updates existing rows.

## What Not To Do

- Do not commit `.env`.
- Do not commit Supabase service keys.
- Do not commit Google API keys.
- Do not commit student/admin access tokens.
- Do not rely on SQLite for production on Vercel.
- Do not show unreviewed student submissions publicly.
- Do not collect patient-specific information.
