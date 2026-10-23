/**
 * OPEN DATA: the credit each licence requires, as literal strings with no
 * imports, so the local scripts can bundle them without dragging in the app.
 * test/unit/open-data.test.ts asserts these equal the strings the rest of
 * the site already uses (OGL_CANADA_ATTRIBUTION, TORONTO_ATTRIBUTION, ...).
 *
 * Wording is each licence's own "acknowledge the source" formula:
 *   OGL-Canada v2.0   "Contains information licensed under the Open Government Licence – Canada."
 *   OGL-Toronto       "Contains information licensed under the Open Government Licence – Toronto."
 *   OGL-Vancouver     "Contains information licensed under the Open Government Licence – Vancouver."
 *   OGL-Calgary       "Contains information licensed under the Open Government Licence – City of Calgary."
 * Municipal ArcGIS cities: see ARCGIS_CITIES (arcgis-permits.ts).
 */
export const OGL_CANADA = "Contains information licensed under the Open Government Licence – Canada.";
export const OGL_TORONTO = "Contains information licensed under the Open Government Licence – Toronto.";
export const OGL_VANCOUVER = "Contains information licensed under the Open Government Licence – Vancouver.";
export const OGL_CALGARY = "Contains information licensed under the Open Government Licence – City of Calgary.";
