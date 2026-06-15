# Data Strategy

This project should optimize for verified, patient-safe resource listings over sheer breadth. For post-stroke brochures, a disconnected phone number, closed clinic, or wrong eligibility detail can break trust and create real access barriers.

## Verification-First Pipeline

Use a tiered pipeline. Higher tiers should override or suppress lower-confidence records when names/addresses overlap.

### Tier 1: Counselor-Verified Core

Source: `data/trusted-resources.json`

Use this for highly specific stroke resources and local partner programs:

- stroke support groups
- hospital/community partner programs
- known transportation contacts
- local food-bank navigation lines
- trusted benefits/navigation services
- caregiver support resources

Suggested fields to add next:

- `lastVerified`
- `verifiedBy`
- `eligibility`
- `languages`
- `accessibility`
- `referralInstructions`

### Tier 2: Federal Backbone

These sources should populate `resources.sqlite` through scheduled import scripts.

- **HRSA Data Warehouse:** Federally Qualified Health Centers and HRSA-funded sites. Best fit for community clinics and primary care.
- **SAMHSA Behavioral Health Locator / public-use files:** behavioral health, substance-use, and counseling resources.
- **CMS open data:** skilled nursing facilities, inpatient rehabilitation facilities, home health agencies, and other Medicare-certified care settings.

These are better than generic map search for clinical resources because they are structured, maintained, and closer to operational truth.

### Tier 3: Community Resource Layer

Use local or regional data-sharing partnerships when available.

- local 2-1-1 APIs or CSV exports
- Open Referral / HSDS feeds
- county health department directories
- Area Agencies on Aging spreadsheets
- food bank pantry locator exports

This layer is likely the best source for food, transportation, utility assistance, benefits navigation, caregiver support, and aging services.

### Tier 4: Physical Infrastructure Fallback

Use OpenStreetMap only for structural assets where a map database is a good fit:

- library branches
- transit stations
- grocery stores
- parks

Do not use OpenStreetMap as the main source for:

- clinical eligibility
- counseling programs
- social-service eligibility
- food-pantry hours
- post-stroke support programs

The current app restricts OSM fallback to infrastructure categories and filters out records without a street address.

### Optional Paid Fallback

Google Places can fill gaps in phone, website, and address coverage, but it should be optional:

- `RESOURCE_SOURCE=auto`: use free/trusted/cache first, then Google fallback
- `RESOURCE_SOURCE=google`: Google only

Keep Google API keys server-side and set budget alerts/quotas before production use.

## SQLite Import Plan

Create one import script per source:

```text
scripts/import_hrsa.js
scripts/import_samhsa.js
scripts/import_cms.js
scripts/import_open_referral.js
scripts/import_aaa_csv.js
```

Normalize all sources into a common table:

```text
resources
  id
  source
  source_id
  name
  category_key
  category
  address
  city
  state
  zip
  phone
  website
  lat
  lng
  eligibility
  notes
  last_verified
  verification_status
  updated_at
```

Keep raw source tables too, so imports are auditable:

```text
raw_hrsa_sites
raw_samhsa_sites
raw_cms_facilities
raw_open_referral_services
```

## Quality Rules

Recommended filters before a resource appears in a patient-facing brochure:

- must have a name
- must have a street address or a clearly remote/phone-only service flag
- must have a phone, website, or referral instruction
- must have a source label
- must be recently verified or from a maintained federal/community dataset
- must not be marked closed/inactive

For student testing, build a review queue:

- missing phone
- missing website
- duplicate name/address
- stale `lastVerified`
- category mismatch
- too far from ZIP centroid

## Near-Term Research Questions

- Does the local 2-1-1 offer API, CSV, or HSDS/Open Referral export access?
- Does the health system already license Findhelp or Unite Us?
- Which Area Agency on Aging covers the target counties, and do they share spreadsheets?
- Does the regional food bank have a pantry locator feed?
- Which HRSA/CMS facility types should be brochure-eligible for stroke outreach?
- Should Google be used only for phone/address enrichment, not as a primary listing source?
