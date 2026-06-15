args <- commandArgs(trailingOnly = TRUE)
zip <- if (length(args) >= 1) args[[1]] else ""
year <- if (length(args) >= 2) as.integer(args[[2]]) else 2022

local_lib <- file.path(getwd(), "r-lib")
if (dir.exists(local_lib)) {
  .libPaths(c(local_lib, .libPaths()))
}

json_escape <- function(x) {
  x <- gsub("\\\\", "\\\\\\\\", x)
  x <- gsub('"', '\\"', x)
  x
}

emit_error <- function(message) {
  cat(sprintf('{"ok":false,"error":"%s"}\n', json_escape(message)))
  quit(status = 0)
}

if (!nzchar(zip) || !grepl("^\\d{5}$", zip)) {
  emit_error("Expected a five-digit ZIP/ZCTA.")
}

if (!requireNamespace("sociome", quietly = TRUE)) {
  emit_error("R package 'sociome' is not installed.")
}

if (!requireNamespace("tidycensus", quietly = TRUE)) {
  emit_error("R package 'tidycensus' is not installed.")
}

key <- Sys.getenv("CENSUS_API_KEY")
if (nzchar(key)) {
  tidycensus::census_api_key(key, install = FALSE, overwrite = TRUE)
}

reference_zcta <- substr(zip, 1, 3)

result <- tryCatch(
  sociome::get_adi(
    geography = "zcta",
    zcta = reference_zcta,
    year = year,
    dataset = "acs5",
    cache_tables = TRUE
  ),
  error = function(e) e
)

if (inherits(result, "error")) {
  emit_error(conditionMessage(result))
}

if (nrow(result) < 1) {
  emit_error("No ADI data returned for this ZIP/ZCTA.")
}

matched <- result[result$GEOID == zip, ]
if (nrow(matched) < 1) {
  emit_error("No ADI data returned for this ZIP/ZCTA.")
}

row <- matched[1, ]
adi <- ifelse(is.na(row$ADI), "null", as.character(round(row$ADI, 2)))
financial <- ifelse(is.na(row$Financial_Strength), "null", as.character(round(row$Financial_Strength, 2)))
hardship <- ifelse(is.na(row$Economic_Hardship_and_Inequality), "null", as.character(round(row$Economic_Hardship_and_Inequality, 2)))
education <- ifelse(is.na(row$Educational_Attainment), "null", as.character(round(row$Educational_Attainment, 2)))

cat(sprintf(
  '{"ok":true,"zip":"%s","geography":"ZCTA","referenceArea":"ZCTAs beginning with %s","year":%d,"source":"sociome acs5","adi":%s,"financialStrength":%s,"economicHardshipAndInequality":%s,"educationalAttainment":%s}\n',
  json_escape(zip),
  json_escape(reference_zcta),
  year,
  adi,
  financial,
  hardship,
  education
))
