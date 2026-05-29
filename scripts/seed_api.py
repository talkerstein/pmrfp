#!/usr/bin/env python3
"""One-shot content seeder via the Supabase REST API (service key).
Idempotent: re-running ignores duplicates. Usage: python seed_api.py <URL> <SERVICE_KEY>"""
import json, sys, urllib.request, urllib.error

BASE, KEY = sys.argv[1].rstrip("/"), sys.argv[2]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def req(method, path, body=None, prefer=None):
    headers = dict(H)
    if prefer: headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{BASE}/rest/v1/{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return json.loads(txt) if txt else []
    except urllib.error.HTTPError as e:
        print(f"  ! {method} {path} -> {e.code}: {e.read().decode()[:300]}")
        return None

def idmap(table):
    rows = req("GET", f"{table}?select=id,slug") or []
    return {x["slug"]: x["id"] for x in rows}

cat = idmap("trade_categories"); reg = idmap("regions"); pt = idmap("property_types")

ORGS = [
 ("Northline Electrical Ltd.","northline-electrical","trade_company","Toronto","Commercial & condominium electrical maintenance and service upgrades across the GTA.",18,True,True,"request_intro",88),
 ("Summit Mechanical (HVAC)","summit-mechanical-hvac","trade_company","North York","HVAC preventive maintenance and mechanical services for apartment and office buildings.",12,True,False,"show_contact",82),
 ("IronClad Roofing","ironclad-roofing","trade_company","Mississauga","Flat-roof TPO, commercial re-roofs, and leak repair for plazas and warehouses.",22,True,False,"request_intro",79),
 ("PureClean Facility Services","pureclean-facility","trade_company","Hamilton","Janitorial and cleaning contracts for multi-residential and office properties.",9,True,False,"request_intro",74),
 ("GTA SnowPro","gta-snowpro","trade_company","Vaughan","Commercial snow removal and de-icing for plazas, condos, and parking structures.",14,False,False,"hide_contact",71),
 ("Apex Asphalt & Concrete","apex-asphalt-concrete","trade_company","Brampton","Parking lot asphalt repair, line painting, and concrete work for commercial sites.",16,False,False,"request_intro",68),
 ("Guardian Fire & Safety","guardian-fire-safety","trade_company","Ottawa","Fire alarm inspection, extinguisher service, and life-safety compliance.",20,True,False,"show_contact",85),
 ("Vista Glass & Windows","vista-glass-windows","trade_company","Markham","Commercial glass replacement, storefront, and window repair.",7,False,False,"request_intro",62),
 ("Toronto Painters","toronto-painters","trade_company","Toronto","Commercial & residential painting — interiors, common areas, and exterior repaints.",12,True,False,"request_intro",70),
 ("Northview Windows and Doors","northview-windows-doors","trade_company","Toronto","Window and door supply, replacement, and repair for residential & commercial buildings.",15,True,False,"request_intro",72),
 ("Maple Electric Supply","maple-electric-supply","supplier","Toronto","Electrical supply distributor for contractors — fixtures, panels, wire & lighting.",20,True,False,"show_contact",75),
]
org_rows = [{"name":n,"slug":s,"organization_type":t,"city":c,"province":"Ontario","country":"Canada",
  "short_description":d,"full_description":d,"years_in_business":y,"verified":v,"featured":f,
  "is_demo":True,"profile_status":"approved","profile_completion_score":sc,
  "public_contact_visibility":cv,"status":"active"} for (n,s,t,c,d,y,v,f,cv,sc) in ORGS]
print("orgs:", "ok" if req("POST","organizations",org_rows,"resolution=ignore-duplicates,return=minimal") is not None else "FAIL")
org = idmap("organizations")

def join(table, fk, pairs, ref):
    rows=[{"organization_id":org[o], fk:ref[x]} for o,x in pairs if o in org and x in ref]
    print(f"{table}:", "ok" if req("POST",table,rows,"resolution=ignore-duplicates,return=minimal") is not None else "FAIL", len(rows))

join("organization_categories","category_id",[
 ("northline-electrical","electrical"),("northline-electrical","lighting"),("northline-electrical","ev-charging"),
 ("summit-mechanical-hvac","hvac"),("summit-mechanical-hvac","building-automation"),
 ("ironclad-roofing","roofing"),("ironclad-roofing","waterproofing"),
 ("pureclean-facility","cleaning-janitorial"),("pureclean-facility","property-maintenance"),
 ("gta-snowpro","snow-removal"),("gta-snowpro","landscaping"),
 ("apex-asphalt-concrete","concrete-and-asphalt"),("apex-asphalt-concrete","parking-lot-maintenance"),
 ("guardian-fire-safety","fire-safety"),("guardian-fire-safety","security-systems"),
 ("vista-glass-windows","glass-and-windows"),
 ("toronto-painters","painting"),("toronto-painters","drywall"),
 ("northview-windows-doors","glass-and-windows"),("northview-windows-doors","garage-doors"),
 ("maple-electric-supply","electrical"),("maple-electric-supply","lighting"),
], cat)
join("organization_regions","region_id",[
 ("northline-electrical","toronto"),("northline-electrical","north-york"),("northline-electrical","greater-toronto-area"),
 ("summit-mechanical-hvac","north-york"),("summit-mechanical-hvac","toronto"),
 ("ironclad-roofing","mississauga"),("ironclad-roofing","greater-toronto-area"),
 ("pureclean-facility","hamilton"),("pureclean-facility","burlington"),
 ("gta-snowpro","vaughan"),("gta-snowpro","richmond-hill"),("gta-snowpro","markham"),
 ("apex-asphalt-concrete","brampton"),("apex-asphalt-concrete","mississauga"),
 ("guardian-fire-safety","ottawa"),
 ("vista-glass-windows","markham"),("vista-glass-windows","toronto"),
 ("toronto-painters","toronto"),("toronto-painters","north-york"),("toronto-painters","greater-toronto-area"),
 ("northview-windows-doors","toronto"),("northview-windows-doors","greater-toronto-area"),("northview-windows-doors","markham"),
 ("maple-electric-supply","toronto"),("maple-electric-supply","greater-toronto-area"),
], reg)
join("organization_property_types","property_type_id",[
 ("northline-electrical","condominium"),("northline-electrical","commercial-office"),
 ("summit-mechanical-hvac","apartment-building"),("summit-mechanical-hvac","commercial-office"),
 ("ironclad-roofing","retail-plaza"),("ironclad-roofing","warehouse"),
 ("pureclean-facility","rental-residential"),("pureclean-facility","commercial-office"),
 ("gta-snowpro","retail-plaza"),("gta-snowpro","condominium"),
 ("apex-asphalt-concrete","retail-plaza"),("apex-asphalt-concrete","industrial-building"),
 ("guardian-fire-safety","institutional"),("guardian-fire-safety","commercial-office"),
 ("vista-glass-windows","commercial-office"),("vista-glass-windows","retail-plaza"),
 ("toronto-painters","condominium"),("toronto-painters","apartment-building"),("toronto-painters","commercial-office"),
 ("northview-windows-doors","condominium"),("northview-windows-doors","apartment-building"),("northview-windows-doors","commercial-office"),
 ("maple-electric-supply","commercial-office"),("maple-electric-supply","apartment-building"),
], pt)

# RFPs: (title, slug, summary, scope, requirements, ptype, city, province, region, bmin, bmax, bpublic, deadline, contact_vis, cat)
RFPS = [
 ("Condominium Electrical Maintenance Contract","condominium-electrical-maintenance-contract","Annual preventive electrical maintenance for a 240-unit condominium tower in downtown Toronto.","Scheduled quarterly inspection of common-area electrical systems, emergency lighting testing, panel servicing, and on-call response for a 240-unit high-rise condominium.","Licensed electrical contractor (ECRA/ESA), $5M liability insurance, WSIB clearance, minimum 5 years commercial experience.","condominium","Toronto","Ontario","toronto",20000,40000,True,"2026-07-15","pmrfp_mediated","electrical"),
 ("Commercial Plaza Snow Removal Services","commercial-plaza-snow-removal-services","Seasonal snow removal and de-icing for a multi-tenant retail plaza in Mississauga.","Full-season snow plowing, sidewalk clearing, and salting/de-icing for a 90,000 sq ft retail plaza with 24/7 trigger-based dispatch.","Proof of insurance, dedicated equipment, 24/7 dispatch capability, salt supply, references for commercial snow contracts.","retail-plaza","Mississauga","Ontario","mississauga",None,None,False,"2026-09-30","pmrfp_mediated","snow-removal"),
 ("Apartment Building HVAC Preventive Maintenance","apartment-building-hvac-preventive-maintenance","Preventive HVAC maintenance program for a 3-building apartment portfolio in North York.","Bi-annual HVAC servicing, rooftop unit maintenance, boiler inspection, and filter programs across three mid-rise apartment buildings.","Licensed HVAC contractor (TSSA), liability insurance, WSIB, references for multi-residential portfolios.","apartment-building","North York","Ontario","north-york",15000,30000,False,"2026-08-01","public_contact","hvac"),
 ("Retail Property Parking Lot Asphalt Repair","retail-property-parking-lot-asphalt-repair","Asphalt repair and line painting for a retail property parking lot in Vaughan.","Pothole repair, crack sealing, partial resurfacing, and re-striping of a 120-space retail parking lot.","Insured asphalt contractor, equipment for hot-mix repair, traffic management plan, weekend work capability.","retail-plaza","Vaughan","Ontario","vaughan",25000,50000,True,"2026-07-31","anonymous_until_interest_approved","concrete-and-asphalt"),
 ("Multi-Residential Cleaning Services Contract","multi-residential-cleaning-services-contract","Daily janitorial and common-area cleaning for a rental residential community in Hamilton.","Daily common-area cleaning, garbage room management, and periodic deep-cleans across a 180-unit rental community.","Insured janitorial company, WSIB, supervised staff, references for multi-residential cleaning.","rental-residential","Hamilton","Ontario","hamilton",None,None,False,"2026-08-20","pmrfp_mediated","cleaning-janitorial"),
 ("Exterior Wall Modification — Commercial Building","exterior-wall-modification-commercial","Structural exterior wall modification and re-cladding for a commercial building in Québec.","Modification of an existing exterior wall assembly including framing changes, cladding, weatherproofing, and restoration of the building envelope to current code.","Licensed contractor (RBQ), liability insurance, CNESST registration, experience with commercial building-envelope work.","commercial-office","Montréal","Quebec","montreal",None,None,False,"2026-08-10","pmrfp_mediated","masonry"),
 ("Emergency Exit Extension & RBQ Compliance","emergency-exit-extension-rbq-compliance","Emergency exit extension and code-compliance work to meet Québec RBQ standards.","Construction of an extended emergency egress including framing, fire-rated assemblies, signage, and full compliance documentation to RBQ standards.","RBQ licence, fire-code experience, liability insurance, CNESST, references for life-safety compliance work.","commercial-office","Québec City","Quebec","montreal",None,None,False,"2026-07-28","pmrfp_mediated","general-contracting"),
 ("Flooring, Paint & Ceiling Renovation","flooring-paint-ceiling-renovation","Interior finishing — flooring, painting, and ceiling renovation for a Toronto residential property.","Removal and replacement of flooring, a full repaint, and ceiling repair/replacement across a multi-unit interior renovation.","Insured interior-finishing contractor, WSIB, dust-control plan, references for occupied-building renovations.","apartment-building","Toronto","Ontario","toronto",None,None,False,"2026-08-05","pmrfp_mediated","flooring"),
 ("HVAC System Replacement","hvac-system-replacement-montreal","Full HVAC system replacement for a commercial property in Montréal.","Removal of end-of-life HVAC equipment and supply/installation of new rooftop units, ductwork modifications, controls, and commissioning.","Licensed HVAC contractor (RBQ/CMMTQ), liability insurance, CNESST, references for commercial HVAC replacements.","commercial-office","Montréal","Quebec","montreal",40000,90000,True,"2026-09-05","public_contact","hvac"),
 ("Kitchen & Bathroom Renovations","kitchen-bathroom-renovations","Kitchen and bathroom renovations across units in a Toronto residential property.","Multi-unit kitchen and bathroom renovations including cabinetry, plumbing fixtures, tiling, and finishing for a residential building.","Insured general contractor, WSIB, plumbing sub-trade coordination, references for multi-unit residential renovations.","rental-residential","Toronto","Ontario","toronto",None,None,False,"2026-08-18","pmrfp_mediated","general-contracting"),
 ("Mold Remediation Specialist","mold-remediation-specialist","Mold assessment and remediation for a residential building near Montréal (Boisbriand).","Inspection, containment, removal, and remediation of mold-affected areas, with air-quality testing and clearance documentation.","Certified mold-remediation specialist, environmental/hazmat protocols, liability insurance, CNESST, clearance reporting.","apartment-building","Boisbriand","Quebec","montreal",None,None,False,"2026-07-22","anonymous_until_interest_approved","mold-remediation"),
 ("Electrical Service Contractor","electrical-service-contractor-gta","Licensed electrician needed for service and repair work across a GTA property portfolio.","On-call electrical service, repairs, fixture and panel work, and code corrections across a portfolio of commercial and residential properties.","ECRA/ESA licensed electrician, liability insurance, WSIB, availability for scheduled and emergency calls.","multi-site-portfolio","Toronto","Ontario","greater-toronto-area",None,None,False,"2026-07-20","pmrfp_mediated","electrical"),
]
rfp_rows=[{"title":t,"slug":s,"summary":sm,"scope":sc,"requirements":rq,
  "property_type_id":pt.get(p),"city":c,"province":pr,"region_id":reg.get(rg),
  "budget_min":bmn,"budget_max":bmx,"budget_public":bp,"deadline":dl,"contact_visibility":cv,
  "source_type":"admin_seeded","status":"published","is_demo":True,"published_at":"now()"}
  for (t,s,sm,sc,rq,p,c,pr,rg,bmn,bmx,bp,dl,cv,_) in RFPS]
# published_at needs a timestamp, not "now()" literal via REST
import datetime
now=datetime.datetime.utcnow().isoformat()+"Z"
for r in rfp_rows: r["published_at"]=now
print("rfps:", "ok" if req("POST","rfp_posts",rfp_rows,"resolution=ignore-duplicates,return=minimal") is not None else "FAIL")
rfp = idmap("rfp_posts")
rc=[{"rfp_id":rfp[s],"category_id":cat[catslug]} for (_,s,_,_,_,_,_,_,_,_,_,_,_,_,catslug) in RFPS if s in rfp and catslug in cat]
print("rfp_categories:", "ok" if req("POST","rfp_categories",rc,"resolution=ignore-duplicates,return=minimal") is not None else "FAIL", len(rc))

RES=[
 ("How Commercial Property RFPs Work in Canada","how-commercial-property-rfps-work-in-canada","A plain-English guide to how property managers issue RFPs and how trades can respond.","## How Commercial Property RFPs Work in Canada\n\nCommercial property work in Canada often moves through preferred-vendor lists, referrals, and fragmented RFP channels.\n\n### What is an RFP?\nA Request for Proposal (RFP) is how a property manager, builder, or owner formally invites vendors to bid on a project or service contract.\n\n### How to respond effectively\n- Read the scope carefully\n- Confirm insurance and licensing requirements\n- Submit a clear capability statement"),
 ("Vendor Prequalification Checklist","vendor-prequalification-checklist","The documents and credentials property managers commonly require from vendors.","## Vendor Prequalification Checklist\n\n- Proof of liability insurance\n- WSIB clearance certificate\n- Trade licensing / certifications\n- References from similar properties\n- Capability statement\n- Health & safety policy"),
 ("Snow Removal RFP Checklist","snow-removal-rfp-checklist","What to include when bidding on a commercial snow removal contract.","## Snow Removal RFP Checklist\n\n- Trigger depth and response times\n- Equipment and salt supply\n- 24/7 dispatch\n- Insurance and slip-and-fall coverage\n- Site map and service zones"),
]
res_rows=[{"title":t,"slug":s,"excerpt":e,"body":b,"status":"published","is_demo":True,"published_at":now} for (t,s,e,b) in RES]
print("resources:", "ok" if req("POST","resources",res_rows,"resolution=ignore-duplicates,return=minimal") is not None else "FAIL")

print("DONE — orgs:", len(idmap('organizations')), "rfps:", len(idmap('rfp_posts')))
