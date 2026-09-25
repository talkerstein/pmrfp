/**
 * Real photos of commercial property and trades work, served from
 * `public/images/photos/`. Sources and licences are listed in
 * `public/images/photos/SOURCES.md` (all Unsplash License: free for commercial
 * use, no attribution required).
 */
export interface Photo {
  src: string;
  alt: string;
}

const p = (file: string, alt: string): Photo => ({ src: `/images/photos/${file}.webp`, alt });

/** Named photos, reused across trade hubs and marketing pages. */
export const PHOTOS = {
  hvac: p("hvac-rooftop-units", "Technician walking between rooftop HVAC units on a commercial building"),
  roof: p("roof-rooftop-units-winter", "Flat commercial roof with rooftop units and patches of snow"),
  electrical: p("electrical-panel-testing", "Electrician testing breakers in a distribution panel with a voltage tester"),
  plumbing: p("plumbing-mechanical-room", "Pipes, valves and pressure gauges in a building mechanical room"),
  snow: p("snow-plow-truck", "Snow plow truck clearing a road during a winter storm"),
  scaffolding: p("scaffolding-crew", "Crew in hard hats and hi-vis climbing scaffolding on a building"),
  landscaping: p("landscaping-crew-mowing", "Grounds crew mowing and trimming the lawn at a property"),
  paving: p("asphalt-paving", "Asphalt paver laying fresh pavement with a worker alongside"),
  parkingLot: p("parking-lot-aerial", "Aerial view of a large commercial parking lot with painted stalls"),
  sprinkler: p("fire-sprinkler-piping", "Red fire sprinkler piping running along a concrete parking garage ceiling"),
  loadingDocks: p("warehouse-loading-docks", "Loading dock doors on an industrial warehouse"),
  condo: p("condo-midrise", "Mid-rise condominium building with balconies"),
  lobby: p("office-lobby", "Office building lobby with a stone reception desk"),
  lobbyGates: p("lobby-security-gates", "Office lobby with security turnstiles and elevators"),
  elevatorLobby: p("elevator-lobby", "Elevator bank in a commercial building lobby"),
  windowCleaners: p("window-cleaners-tower", "Window cleaners on ropes washing the glass facade of an office tower"),
  cameras: p("security-cameras", "Two surveillance cameras mounted on a building wall"),
  evCharging: p("ev-charging", "Electric car plugged into a charging post in a parking area"),
  framing: p("carpentry-framing", "Carpenter working on wood framing against a blue sky"),
  demolition: p("demolition", "Crew and a mini excavator demolishing part of a building"),
  masonry: p("masonry-block-wall", "Mason setting concrete blocks with a trowel"),
  drywall: p("drywall-steel-studs", "Commercial interior fit-out with steel studs and drywall sheets"),
  solar: p("rooftop-solar", "Solar panels covering a flat commercial rooftop"),
  floorCrew: p("warehouse-floor-crew", "Crew finishing the polished concrete floor of a new warehouse"),
  ceilingLift: p("ceiling-lift-install", "Technician on a lift installing equipment on a garage ceiling"),
  dumpster: p("construction-dumpster", "Roll-off dumpster loaded with construction debris"),
  pest: p("pest-control-sprayer", "Pest control technician holding a pressure sprayer"),
  fence: p("chain-link-fence", "Chain-link fence along the edge of a property"),
  rollUpDoor: p("roll-up-door", "Steel roll-up door on a commercial building"),
  waterDamage: p("ceiling-water-damage", "Water-damaged ceiling with plaster torn away"),
  keys: p("keys-in-door", "Hand holding a set of keys at an open door"),
  woodshop: p("woodworking-shop", "Woodworker at a bench in a millwork shop"),
  retailAerial: p("retail-power-centre-aerial", "Aerial view of a suburban retail power centre and its parking lots"),
  floorCoating: p("floor-coating-crew", "Crew rolling a coating onto the concrete floor of a large warehouse"),
  officeTower: p("office-tower-glass", "Curved glass facade of a modern office building"),
  torontoFlatiron: p("toronto-flatiron", "Toronto's Gooderham Flatiron Building with downtown towers behind it"),
  siteCrew: p("site-crew-deck", "Construction crew in hard hats and hi-vis working on a concrete deck"),
} satisfies Record<string, Photo>;

/** Trade category slug → hero photo. Categories not listed use `FALLBACK_TRADE_PHOTO`. */
const TRADE_PHOTOS: Record<string, Photo> = {
  electrical: PHOTOS.electrical,
  plumbing: PHOTOS.plumbing,
  hvac: PHOTOS.hvac,
  roofing: PHOTOS.roof,
  "general-contracting": PHOTOS.scaffolding,
  "cleaning-janitorial": PHOTOS.lobby,
  landscaping: PHOTOS.landscaping,
  "snow-removal": PHOTOS.snow,
  "security-systems": PHOTOS.cameras,
  "fire-safety": PHOTOS.sprinkler,
  "elevator-services": PHOTOS.elevatorLobby,
  restoration: PHOTOS.waterDamage,
  painting: PHOTOS.scaffolding,
  flooring: PHOTOS.floorCrew,
  "glass-and-windows": PHOTOS.windowCleaners,
  "pest-control": PHOTOS.pest,
  locksmith: PHOTOS.keys,
  "concrete-and-asphalt": PHOTOS.paving,
  "waste-removal": PHOTOS.dumpster,
  "building-automation": PHOTOS.ceilingLift,
  "handyman-maintenance": PHOTOS.ceilingLift,
  "garage-doors": PHOTOS.rollUpDoor,
  waterproofing: PHOTOS.roof,
  masonry: PHOTOS.masonry,
  drywall: PHOTOS.drywall,
  carpentry: PHOTOS.framing,
  fencing: PHOTOS.fence,
  "property-maintenance": PHOTOS.condo,
  lighting: PHOTOS.ceilingLift,
  "energy-efficiency": PHOTOS.solar,
  "ev-charging": PHOTOS.evCharging,
  "access-control": PHOTOS.lobbyGates,
  "cameras-surveillance": PHOTOS.cameras,
  "parking-lot-maintenance": PHOTOS.parkingLot,
  signage: PHOTOS.retailAerial,
  millwork: PHOTOS.woodshop,
  demolition: PHOTOS.demolition,
  "environmental-hazardous-materials": PHOTOS.demolition,
  "dumpster-bin-rental": PHOTOS.dumpster,
  "mold-remediation": PHOTOS.waterDamage,
};

export const FALLBACK_TRADE_PHOTO: Photo = PHOTOS.loadingDocks;

export function tradePhoto(slug: string): Photo {
  return TRADE_PHOTOS[slug] ?? FALLBACK_TRADE_PHOTO;
}

/** Trade display name ("Cleaning & Janitorial") → hero photo, via its slug. */
export function tradePhotoForName(name: string | undefined | null): Photo {
  if (!name) return FALLBACK_TRADE_PHOTO;
  const slug = name
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return tradePhoto(slug);
}
