# SENTRA

SENTRA is the existing React + TypeScript + Vite application with two separate modules:

- **CITYPULSE** — environmental risk monitoring (the original module and default landing page).
- **CRISISMESH** — emergency incident management and rescue-navigation prototype.

Use the module switcher in the left navigation to move between them. CITYPULSE retains its own environmental workflow and `citypulse.*` browser storage keys. CRISISMESH records use a separate `crisisMesh.prototype.v1` key.

## Run locally

```sh
npm install
npm run dev
```

Create a production bundle with `npm run build`; serve it with `npm run preview`.

## CRISISMESH: demo scope and limitations

CRISISMESH starts in **DEMO MODE**. Included sample incidents, teams, users, timeline entries, and notifications are marked as sample/simulated. New reports and any teams/users created from the interface are browser-prototype data. They persist in this browser's localStorage only; clearing site data removes them. Nothing is synced to another device or a backend.

The role picker previews Admin, Emergency Coordinator, Rescue Team, and Reporter interfaces. It is **not login or secure authentication**: roles live in frontend state and can be changed or bypassed. There is no backend access control. Do not use this prototype for real incident intake, personally identifying/contact data, operational team assignments, emergency decisions, or rescue navigation. No emergency service is contacted.

The report form validates incident type, description, severity, location, coordinates, and optional image/contact details. GPS uses browser permission and can provide coordinates without internet when satellite reception is available. A point can be selected on the map and copied into the report. Small image attachments are browser-stored.

Incident priority is a transparent demo rule based on reported severity, incident type, and a short list of reported condition terms. The screen shows its rationale; an authorized demo coordinator can review and change priority. It is not a scientifically validated prediction or substitute for dispatcher judgment.

Assignment, team availability, field status updates, and in-app notifications are local simulations. The directory's teams and registered locations are sample data; the sample-team route/ETA is not operational guidance. Reporter views are limited to reports submitted using the Reporter demo role; Rescue Team views are limited to the selected demo team's assignments. These UI checks are not secure backend authorization.

Workflow states are Reported → Under Review → Assigned → Responding → On Scene → Resolved. The coordinator can review reports, change priority, and assign an available capable demo team. Rescue Team can advance its own assignment and resolve it. Each transition is written to a local timeline and creates a simulated notification.

## CITYPULSE integration

A CITYPULSE alert can be copied into a CRISISMESH draft only after a human has set its status to **Under Review** in CITYPULSE. Its explanation and available location coordinates are prefilled; a person must verify and submit it. The conversion does not claim that an environmental anomaly proves pollution cause, an emergency, or a facility's responsibility.

## Maps, routing, offline, and configuration

- **Interactive map:** Leaflet displays OpenStreetMap public tiles with attribution. No map API key is needed. Tiles require internet. The public tile server is best-effort, capacity-limited, and has no SLA. Follow the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/); do not bulk-download tiles. OpenStreetMap data is free under its licence, but the public tile servers are not an unlimited free map-hosting service.
- **Global place search:** The CRISISMESH Maps page searches countries, regions, cities, towns, and addresses through the public Nominatim geocoder when the user submits a search, and reverse-geocodes a clicked map point. Search results provide country/region/city details where available and move the map without reloading the app. The browser sends requests directly; no key is needed. Nominatim's public service is limited to at most one request per second, has no service guarantee, and must not be used for autocomplete. The app spaces requests and performs no keystroke lookups. Provide OpenStreetMap attribution and follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/); use a hosted geocoder or your own service for production/high-volume use.
- **Weather intelligence:** CRISISMESH's Weather section shares the selected place from Maps, including reverse-geocoded map pins and optional GPS. It requests Open-Meteo current model conditions, hourly forecast, and a seven-day forecast by coordinates. Values are labelled as model-based, not guaranteed station observations; retrieval time is shown. The Open-Meteo forecast endpoint used here requires no API key. It does not return severe-weather alerts in this integration, so the UI directs users to official local warnings and does not invent them. There are no API credentials to configure and no `.env.example` is needed for these public endpoints.
- **Road routes and ETA:** A route geometry, distance, and routing-service duration are requested from the public OSRM demo endpoint. No key is used. This public endpoint is not a production dispatch service and provides no live-traffic guarantee. The UI displays no route/ETA if the request fails. Suitable teams can optionally be compared with the OSRM table service; when estimates fail, teams are described and ranked by straight-line distance only.
- **Routing configuration:** To use an OSRM-compatible server, create `.env.local` in the project root:

  ```env
  VITE_OSRM_ROUTING_URL=https://router.project-osrm.org/route/v1/driving
  ```

  Restart Vite after changing it. This is a **public service URL**, not a secret. Vite exposes `VITE_` variables in browser bundles: never put an API secret, private key, or service-account credential in one. If a selected route provider needs a credential, make requests through an appropriately secured backend/proxy and configure key restrictions. No Google Maps service is currently configured; selecting Google Maps APIs/SDKs would require a Google Cloud project, enabled APIs, a restricted API key, billing, and service-specific quotas/costs.
- **Offline:** GPS can supply coordinates without internet when satellite reception is available. An online map is not automatically an offline map. Offline maps need map data downloaded/stored in advance; offline routing needs suitable road data and a compatible routing engine. Neither is included and full offline routing is future work. Live team locations, traffic, dispatch, and incident updates require connectivity.

## Backend, authentication, notifications, and service requirements

There is no configured backend, Firebase project, authentication provider, database, or external notification provider in this project. CRISISMESH uses browser localStorage as prototype persistence. A real deployment needs a trusted backend, identity provider, server-enforced roles/record access, durable data, audit logging, and secured integrations. Never treat this browser role selector as an access boundary.

| Capability | Current behavior / keys | Production requirements and cost notes |
| --- | --- | --- |
| Map display | OpenStreetMap tiles; no API key, online only, attribution and tile policy apply. | Public OSM tiles are best-effort and capacity-limited. At operational scale use a suitable hosted tile provider or host tiles. Commercial Google Maps services need an enabled Google Cloud API, restricted key, and billing; SKU, quotas, free usage, and prices depend on API, region, and account. See [official pricing](https://mapsplatform.google.com/pricing/) and [key security guidance](https://developers.google.com/maps/api-security-best-practices). |
| Geocoding / place search | Public Nominatim search and reverse-geocoding; no key; explicit search only, rate-limited to at most 1 request/second, internet required. | Public endpoint is not intended for autocomplete or high-volume/production-critical use and has no SLA. Follow the [official usage policy](https://operations.osmfoundation.org/policies/nominatim/) or select a hosted geocoding provider with appropriate quotas and terms. |
| Routing / ETA | Public OSRM demo; no API key; internet required; no live traffic. | Operate a suitable routing server or choose a provider with appropriate availability/terms. Google Routes requires API enablement and billing; costs and usage quotas vary by SKU and region. Review the [official pricing](https://mapsplatform.google.com/pricing/) before enabling it. |
| Authentication / database | Not configured; browser localStorage only. | Firebase is not configured. A Firebase implementation requires a Firebase project, authentication provider setup, database creation, and security rules. Firebase has plan-specific no-cost allowances/limits and usage-based paid features; limits depend on product/plan. Verify [current Firebase pricing](https://firebase.google.com/pricing) before selecting a plan or enabling billing. |
| Weather / environmental data | CRISISMESH location weather and CITYPULSE forecasts use public Open-Meteo APIs without an API key; CITYPULSE demo mode is on by default. CRISISMESH weather is model-based, updates for the shared selected location, and does not include severe-weather alerts. | Open-Meteo's [free API](https://open-meteo.com/en/pricing) is for non-commercial use, is rate-limited (currently listed as 10,000 calls/day), and has no uptime guarantee. Commercial use requires the applicable customer API plan/key. Follow its [data licence/attribution](https://open-meteo.com/en/licence). Check the official terms for current limits. |
| Notifications | CRISISMESH in-app notifications are local simulated records. | Email, SMS, and push require provider configuration and a trusted server-side sender. Firebase Cloud Messaging needs a client setup plus a trusted sending environment; adjacent services may have separate usage/billing terms. SMS pricing and carrier fees vary by destination/provider; consult the [current Twilio rate card](https://www.twilio.com/en-us/sms/pricing) or chosen provider. No prices are assumed here. |

Provider information checked on **15 October 2026**. Prices, free allowances, quotas, billing requirements, and terms change; confirm the official provider page and selected region/account before deployment. CRISISMESH currently requires no API key to display the OSM map or call the public OSRM demo endpoint. A production provider/backend may require credentials and billing configuration.

## CITYPULSE data and screening

CITYPULSE demo mode is enabled by default and uses clearly labelled sample readings. Turn it off in **Settings** to retrieve weather and forecast data from Open-Meteo and available pollutant readings from the Open-Meteo Air Quality API. If a request fails, CityPulse reports the issue and shows labelled demo samples instead.

Locations, settings, risk assessments, alert status history, and retrieved hourly observations are stored in the current browser's localStorage. They are not uploaded, shared, or synchronized. Clearing browser site data removes this workspace.

CITYPULSE risk scores are deterministic, explainable screening scores from 0 to 100. Rules check temperature departure from a recent hourly baseline, rapid humidity and wind changes, elevated PM2.5 and NO₂ readings, heavy hourly rainfall, strong winds, and combinations of factors. Thresholds can be adjusted in Settings; assessments with too little historical data are marked preliminary.

Scores and alerts indicate conditions that may warrant review; they do not establish the cause of an environmental change or predict an environmental disaster. Confirm unusual readings independently and follow applicable environmental procedures.

## Validation

Run `npm run build` for TypeScript validation and a production bundle. Manual browser checks: module switching; report validation, image, local persistence and reload; role filtering/restricted actions; coordinator review, priority and assignment; team status workflow; incident search/filters; global map place search and result selection; map-click reverse geocoding; map/GPS-to-weather location synchronization; weather loading/network errors and forecasts; GPS permission errors; map tile errors; routing success/failure; and CITYPULSE alert draft import.
