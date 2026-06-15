# Stroke Resource Finder IT Handoff

This document is intended for department IT, informatics, or a technical owner taking over deployment and maintenance of Stroke Resource Finder.

## Executive Summary

Stroke Resource Finder is a public-facing, low-risk outreach support tool. It is designed to help stroke program staff and supervised students build ZIP-specific lists of public community resources and display area-level deprivation context.

The app must not be used for patient-specific care coordination and must not collect PHI.

Production deployment uses:

```text
GitHub -> Vercel -> Supabase Postgres
```

The app is currently a plain Node/static frontend app, not Next.js.

## Production Architecture

```text
Student / coordinator browser
        |
        v
Vercel static frontend in public/
        |
        v
Vercel serverless API routes in api/
        |
        v
Supabase Postgres via Supabase REST API
```

### Main Components

- `public/`
  Browser UI.

- `api/`
  Vercel serverless API routes.

- `server.js`
  Local development server. It is not the production persistence layer.

- `lib/supabaseResources.js`
  Shared resource, ADI, validation, and Supabase helper functions.

- `supabase/schema.sql`
  Database schema and lightweight migrations.

- `scripts/adi_sociome.R`
  Runs `sociome` for one ZIP/ZCTA.

- `scripts/export_adi_sql.js`
  Generates Supabase seed SQL for ADI context.

- `data/trusted-resources.json`
  Coordinator-maintained trusted resource seed list.

- `data/cleveland-cuyahoga-zips.txt`
  Current service-area ZIP target list for ADI generation.

## Repository

Current public repository:

```text
https://github.com/aballekere/strokeresourcefinder
```

Do not commit:

- `.env`
- Supabase service keys
- Vercel env values
- Census API keys
- Google API keys
- student/admin access codes
- generated SQL seed output
- local SQLite database files

The `.gitignore` excludes local secrets and generated local data.

## Runtime Environments

### Production

Production should run on Vercel with Supabase enabled.

Required Vercel environment variables:

```bash
SUPABASE_URL=<Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<Supabase secret/service key>
STUDENT_ACCESS_TOKEN=<student submit passcode>
ADMIN_ACCESS_TOKEN=<coordinator review passcode>
RESOURCE_SOURCE=free
USE_OSM_OVERPASS=0
USE_GOOGLE_PLACES=0
USE_SOCIOME_ADI=0
```

Important:

- `SUPABASE_SERVICE_ROLE_KEY` must stay server-side only.
- `STUDENT_ACCESS_TOKEN` and `ADMIN_ACCESS_TOKEN` are shared passcodes, not user accounts.
- Vercel must be redeployed after changing environment variables.

### Local Development

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:3000
```

Local development can use SQLite fallback if Supabase variables are not set. Do not rely on SQLite in Vercel.

## Database

Database provider:

```text
Supabase Postgres
```

Run this file in Supabase SQL Editor:

```text
supabase/schema.sql
```

### Tables

#### `public.resources`

Stores student-submitted resources and review state.

Important columns:

```text
id uuid primary key
zip text
category_key text
category text
name text
address text
phone text
website text
notes text
created_by text
status text
reviewed_by text
reviewed_at timestamptz
source text
created_at timestamptz
```

Resource status values:

```text
pending
approved
rejected
```

Search results only include:

```text
status = approved
```

New student submissions are saved as:

```text
status = pending
```

#### `public.adi_context`

Stores precomputed `sociome` ADI context.

Important columns:

```text
zip text primary key
geography text
reference_area text
year integer
adi numeric
financial_strength numeric
economic_hardship_and_inequality numeric
educational_attainment numeric
source text
updated_at timestamptz
```

The app displays `sociome` ADI as a localized score, not a 1-100 percentile:

```text
mean = 100
SD = 20
```

### Required Grants

Supabase REST access requires grants to `service_role`:

```sql
grant usage on schema public to service_role;
grant select, insert, update, delete on public.resources to service_role;
grant select, insert, update, delete on public.adi_context to service_role;
```

### Row Level Security

RLS is enabled. The current policies allow the server-side `service_role` to manage rows. The browser never talks directly to Supabase.

## API Endpoints

### `GET /api/config`

Returns app configuration flags. Useful health check.

Expected production flags:

```json
{
  "supabaseEnabled": true,
  "studentAccessRequired": true,
  "adminAccessRequired": true
}
```

### `GET /api/resources?zip=44106&radius_miles=5`

Returns:

- trusted resources from JSON
- approved Supabase resources for the ZIP/category
- ADI context from Supabase

### `POST /api/resources/manual`

Student submission endpoint.

Requires:

```text
accessToken = STUDENT_ACCESS_TOKEN
```

Writes rows as:

```text
status = pending
```

### `GET /api/admin/resources?adminToken=...`

Coordinator review endpoint.

Requires:

```text
adminToken = ADMIN_ACCESS_TOKEN
```

Returns pending resources.

### `POST /api/admin/resources`

Approves or rejects one resource.

Payload:

```json
{
  "adminToken": "admin passcode",
  "reviewedBy": "coordinator initials",
  "id": "resource uuid",
  "status": "approved"
}
```

`status` can be:

```text
approved
rejected
```

## User Workflows

### Student Submission

1. Student opens the Vercel URL.
2. Student goes to **Add student resource**.
3. Student enters the class access code.
4. Student submits public resource information.
5. The row is saved as `pending`.
6. It does not appear in search yet.

### Coordinator Review

1. Coordinator opens the Vercel URL.
2. Coordinator goes to **Review submissions**.
3. Coordinator enters the admin access code.
4. Coordinator loads pending submissions.
5. Coordinator verifies details externally.
6. Coordinator approves or rejects.
7. Approved resources appear in search.

## ADI Generation

Vercel does not run R. ADI must be precomputed and seeded into Supabase.

### Requirements

- R
- `sociome`
- `tidycensus`
- Census API key

The local project can use a local `r-lib/` if present.

### Generate ADI Seed SQL

```bash
export CENSUS_API_KEY="<census-api-key>"
npm run adi:sql -- --file data/cleveland-cuyahoga-zips.txt
```

Output:

```text
supabase/adi_context_seed.sql
```

Paste that generated SQL into Supabase SQL Editor and run it.

Do not commit the generated seed file. It is ignored by Git.

### Current ADI Notes

The Cleveland/Cuyahoga seed generated rows for 47 ZIPs. Two ZIPs did not return ZCTA ADI data:

```text
44181
44199
```

`44101` returned null ADI values from `sociome`; this is stored as SQL `null`, not zero.

## Trusted Resources

Trusted resources live in:

```text
data/trusted-resources.json
```

These bypass review and appear directly in search if their ZIP rules match.

Use trusted resources for coordinator-approved statewide, national, or core program resources.

Use:

```json
"zipCodes": ["*"]
```

for statewide/national resources.

Use explicit ZIP lists for local resources.

## Security Model

### What Is Protected

- Writes require `STUDENT_ACCESS_TOKEN`.
- Reviews require `ADMIN_ACCESS_TOKEN`.
- Supabase service key stays server-side in Vercel.
- Student submissions are pending until reviewed.
- Website fields must be `http://` or `https://`.
- Frontend renders text with `textContent`, reducing XSS risk.

### What This Is Not

This is not:

- a HIPAA system
- an identity management system
- a patient registry
- a case management system
- a verified provider directory without coordinator review

### PHI Policy

Users must not enter:

- patient names
- MRNs
- dates of birth
- private addresses
- patient phone numbers
- clinical notes
- any patient-specific care details

Only public resource directory information should be entered.

## Known Limitations

- Shared passcodes are lightweight access control, not individual user authentication.
- No per-user audit identity beyond `created_by` and `reviewed_by` free-text fields.
- No admin edit form yet; rejected/incorrect entries must be modified directly in Supabase or resubmitted.
- Radius display is mostly relevant to map-derived/live sources; current Supabase resources are ZIP/category based.
- ADI is based on ZCTA approximation, not patient address.
- `sociome` ADI is a localized score with mean 100 and SD 20, not a 1-100 percentile.

## Operational Checklist

### Before Class Use

- Confirm Vercel deployment is current.
- Confirm `/api/config` reports:

```json
"supabaseEnabled": true,
"studentAccessRequired": true,
"adminAccessRequired": true
```

- Confirm `resources` table has `status`.
- Confirm `adi_context` has rows for target ZIPs.
- Confirm student passcode works.
- Confirm admin passcode works.
- Confirm a test submission appears as pending.
- Confirm approval makes it appear in search.
- Confirm rejected resources do not appear in search.

### Regular Maintenance

- Review pending submissions.
- Spot-check approved resources.
- Reverify trusted resources periodically.
- Rotate passcodes if shared too broadly.
- Refresh ADI context after deciding on a new ACS/sociome year.

## Incident Response

### Spam Or Bad Submissions

1. Rotate `STUDENT_ACCESS_TOKEN` in Vercel.
2. Redeploy Vercel.
3. In Supabase, mark spam rows:

```sql
update public.resources
set status = 'rejected',
    reviewed_by = 'IT',
    reviewed_at = now()
where status = 'pending';
```

### Secret Exposure

If a Supabase service key is exposed:

1. Rotate the key in Supabase if available.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel.
3. Redeploy.
4. Review Supabase logs and table changes.

If student/admin passcodes are exposed:

1. Change the Vercel environment variable.
2. Redeploy.
3. Notify coordinators/students of the new code as appropriate.

## Migration Notes

If an older database exists without review columns, run:

```sql
alter table public.resources
  add column if not exists status text not null default 'pending';

alter table public.resources
  add column if not exists reviewed_by text;

alter table public.resources
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'resources_status_check'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_status_check check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

update public.resources
set status = 'approved'
where status = 'pending'
  and source = 'Student entry';

grant select, insert, update, delete on public.resources to service_role;
```

Do not rerun duplicate `create policy` statements unless they are wrapped in a policy existence check.

## Handoff Contacts And Ownership

Recommended owners:

- Stroke program owner: decides categories, trusted resources, and student workflow.
- IT owner: manages Vercel, Supabase, environment variables, and GitHub access.
- Data owner: owns ADI generation and refresh cadence.
- Review owner: approves/rejects pending resources.

## Appendix: Important Files

```text
README.md
IMPLEMENTATION_GUIDE.md
IT_HANDOFF.md
DATA_STRATEGY.md
supabase/schema.sql
data/trusted-resources.json
data/cleveland-cuyahoga-zips.txt
lib/supabaseResources.js
api/resources.js
api/resources/manual.js
api/admin/resources.js
public/index.html
public/app.js
public/styles.css
```
