/**
 * Spanish copy for the /vs/[competitor] pages, picked by competitorsFor() /
 * getCompetitorFor() in ./competitors.fr. Same shape as COMPETITORS
 * (lib/seo/competitors); slugs, flags and source URLs stay in the English data.
 * Translated faithfully: no claim is added, dropped or strengthened, and every
 * figure matches the English, in U.S. format ("$1,200").
 * `nameOf` is the name after "de" ("de MERX", "del statu quo").
 */
import type { CompetitorCopy } from "./competitors.fr";

const PRICE = "$249 CAD al año (tarifa fija)";

export const COMPETITORS_ES: Record<string, CompetitorCopy> = {
  merx: {
    nameOf: "de MERX",
    seoTitle: "Precios de MERX (2026) y una alternativa más económica para contratistas de construcción",
    seoDescription:
      "MERX Premium cuesta de $50 a $167 al mes, con facturación anual ($600 a $2,004 al año). Qué cubre cada plan, y una opción de $249 al año si solo presenta ofertas para trabajos de edificios y propiedades.",
    priceTable: [
      { plan: "Basic", covers: "Solicitudes de las agencias miembros participantes", price: "Gratis", perYear: "$0" },
      { plan: "Premium Local", covers: "Una provincia (territorios incluidos)", price: "$50 al mes, con facturación anual", perYear: "$600" },
      { plan: "Premium Regional", covers: "Una región", price: "$100 al mes, con facturación anual", perYear: "$1,200" },
      { plan: "Premium National", covers: "Todo Canadá", price: "$167 al mes, con facturación anual", perYear: "$2,004" },
    ],
    priceSource: {
      checked: "24 de septiembre de 2026",
      note: "En CAD, antes de impuestos. MERX indica que la facturación anual ahorra un 50% frente a la mensual. Las oportunidades de construcción privada son una suscripción aparte (por ejemplo, Ontario a $113.17 al mes, con facturación anual).",
    },
    tagline: "El mayor agregador de licitaciones públicas de Canadá.",
    whatItIs:
      "MERX reúne en un solo flujo las licitaciones federales, provinciales, municipales y del sector MASH (además de algunos proyectos de construcción privada), que se venden por provincia, por región o para todo Canadá. Ofrece la presentación electrónica de ofertas para los compradores que publican en la plataforma.",
    whoFor: "Proveedores que presentan ofertas en licitaciones públicas de todos los sectores, en muchas provincias.",
    pricing:
      "Basic es gratis; Premium cuesta $50 (una provincia), $100 (una región) o $167 (todo Canadá) al mes, con facturación anual",
    strengths: [
      "La mayor base de datos de licitaciones de Canadá, de todos los sectores",
      "Todas las provincias y territorios, bilingüe (inglés y francés)",
      "Presentación electrónica de ofertas para los compradores que publican en MERX",
    ],
    weaknesses: [
      "Paga por todos los sectores aunque solo presente ofertas para trabajos de edificios y propiedades",
      "Una cobertura más amplia cuesta más: los planes regional y nacional son solo anuales",
      "Sin RFP privadas de administradores de propiedades, historial de adjudicatarios ni directorio de empresas",
    ],
    angle:
      "MERX vende todo el flujo de licitaciones de Canadá. Si solo presenta ofertas para trabajos de edificios y propiedades, PMRFP reúne las licitaciones que importan (CanadaBuys, la Ciudad de Toronto, el SEAO de Quebec y Yukon) junto con las RFP privadas de administradores de propiedades, con alertas diarias por $249 al año.",
    rows: [
      { feature: "Precio", pmrfp: `${PRICE}, o $29 al mes`, them: "Basic gratis; Premium de $50 a $167 al mes con facturación anual ($600 a $2,004 al año)" },
      { feature: "Licitaciones públicas", pmrfp: "CanadaBuys, Ciudad de Toronto, SEAO de Quebec, Yukon", them: "Federales, provinciales, municipales, MASH: todos los sectores" },
      { feature: "RFP privadas de administradores de propiedades", pmrfp: "Sí", them: "No" },
      { feature: "Filtrado para oficios de edificios y propiedades", pmrfp: "Sí", them: "Usted filtra por categoría" },
      { feature: "Quién ganó los contratos anteriores, y por cuánto", pmrfp: "Sí, gratis", them: "Avisos de adjudicación, cuando el comprador los publica" },
      { feature: "Perfil de empresa en un directorio público", pmrfp: "Sí", them: "No" },
      { feature: "Presentar ofertas en la plataforma", pmrfp: "No: usted presenta su oferta en el portal del emisor", them: "Sí, para las licitaciones alojadas en MERX" },
    ],
    faqs: [
      { q: "¿Cuánto cuesta MERX?", a: "Según la página de precios de MERX (consultada el 24 de septiembre de 2026), Basic es gratis y Premium se vende según la cobertura, con facturación anual: Local (una provincia) $50 al mes, Regional $100 al mes, National $167 al mes. Eso equivale a $600, $1,200 o $2,004 al año, en CAD antes de impuestos. MERX indica que la facturación anual ahorra un 50% frente al pago mensual. PMRFP Trade Pro cuesta $249 CAD al año, o $29 al mes." },
      { q: "¿Cuánto cuesta MERX para Ontario?", a: "Ontario por sí solo corresponde al plan Premium Local: $50 al mes con facturación anual, $600 al año antes de impuestos (consultado el 24 de septiembre de 2026). Las oportunidades de construcción privada de MERX son una suscripción aparte; el plan de Ontario cuesta $113.17 al mes, con facturación anual." },
      { q: "¿MERX es gratis?", a: "Puede consultar los resúmenes de licitaciones en MERX con una cuenta gratuita. Los documentos, las alertas por correo y la presentación de ofertas requieren una suscripción de pago." },
      { q: "¿Hay una alternativa más económica que MERX?", a: "Si solo presenta ofertas para trabajos de edificios, mantenimiento y propiedades, sí. PMRFP reúne licitaciones públicas de CanadaBuys, la Ciudad de Toronto, el SEAO de Quebec y Yukon, agrega RFP privadas de administradores de propiedades y le envía un correo el mismo día en que se publica una que le corresponde, por $249 CAD al año. Si presenta ofertas en todos los sectores y provincias, la cobertura más amplia de MERX vale lo que cuesta." },
      { q: "¿PMRFP tiene licitaciones gubernamentales?", a: "Sí. Cada mañana PMRFP importa las licitaciones abiertas de edificios y propiedades de CanadaBuys, la Ciudad de Toronto, el SEAO de Quebec y el Gobierno de Yukon, bajo sus licencias de datos abiertos. Usted sigue presentando su oferta en el portal del propio emisor." },
      { q: "¿Puedo usar ambos?", a: "Muchos contratistas lo hacen. MERX para la cobertura más amplia del sector público; PMRFP para las RFP de administradores de propiedades, las licitaciones de edificios filtradas, los adjudicatarios de contratos anteriores y un perfil en el directorio que hace que lo encuentren." },
    ],
  },
  vendorpm: {
    nameOf: "de VendorPM",
    tagline: "Gestión de proveedores creada en Toronto para administradores de propiedades.",
    whatItIs:
      "VendorPM es una plataforma de gestión del ciclo de vida y del cumplimiento de proveedores que usan administradores de propiedades en decenas de miles de edificios para encontrar, incorporar y dar seguimiento a sus proveedores.",
    whoFor: "Empresas de administración de propiedades medianas y grandes que gestionan el cumplimiento de sus proveedores a gran escala.",
    pricing: "Empresarial / a medida (los proveedores pagan niveles de membresía)",
    strengths: [
      "Creado en Canadá y enfocado en propiedades comerciales",
      "Sólido seguimiento del cumplimiento y los seguros",
      "Amplia red de edificios",
    ],
    weaknesses: [
      "Orientado a los flujos de trabajo de las grandes administradoras y al cumplimiento de proveedores, no a descubrir RFP abiertas",
      "Los precios de membresía para proveedores son más altos y menos transparentes",
      "Un directorio público menos visible en los buscadores para ganar trabajo nuevo",
    ],
    angle:
      "VendorPM es una gran herramienta de cumplimiento para las grandes administradoras de propiedades. PMRFP es una puerta de entrada más económica y centrada en el descubrimiento (un directorio público más un tablero de RFP abiertas), hecha para que los contratistas sean encontrados y ganen nuevo trabajo comercial, no solo para gestionar el papeleo de los edificios que ya atienden.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "A medida / más alto" },
      { feature: "Función principal", pmrfp: "Descubrimiento + RFP abiertas", them: "Cumplimiento / ciclo de vida de proveedores" },
      { feature: "Directorio público, optimizado para buscadores", pmrfp: "Sí", them: "Limitado" },
      { feature: "Tablero de RFP abiertas", pmrfp: "Sí", them: "Por invitación" },
      { feature: "Enfoque en propiedades comerciales", pmrfp: "Sí", them: "Sí" },
    ],
    faqs: [
      { q: "¿En qué se diferencia PMRFP de VendorPM?", a: "VendorPM es principalmente una herramienta de cumplimiento y gestión de proveedores para grandes administradores de propiedades. PMRFP se centra en el descubrimiento: un directorio público y un tablero de RFP abiertas con una tarifa fija de $249 al año, para que los contratistas sean encontrados y ganen trabajo nuevo." },
      { q: "Ya estoy en VendorPM. ¿Por qué agregar PMRFP?", a: "Hacen trabajos distintos. VendorPM lo mantiene en regla en los edificios que ya lo contratan; PMRFP hace que lo descubran los que todavía no, con un directorio público y un tablero de RFP abiertas. Muchos contratistas usan ambos: VendorPM para las cuentas existentes y PMRFP para ganar nuevas." },
    ],
  },
  "bidnet-direct": {
    nameOf: "de BidNet Direct",
    tagline: "Agregador norteamericano de licitaciones del sector público.",
    whatItIs:
      "BidNet Direct reúne licitaciones gubernamentales de EE. UU. y Canadá, con un módulo de licitaciones públicas canadienses y un sistema de alertas.",
    whoFor: "Proveedores que buscan contratos gubernamentales municipales y provinciales.",
    pricing: "Suscripción, normalmente ~US$500–$1,500 al año (precios para Canadá no publicados)",
    strengths: ["Cubre miles de organismos públicos", "Buen sistema de alertas", "Gratis para los compradores"],
    weaknesses: [
      "Centrado en EE. UU., con un módulo canadiense que parece un complemento",
      "Sin directorio de proveedores ni marketing",
      "Sin enfoque en propiedades comerciales privadas",
    ],
    angle:
      "BidNet es una herramienta de licitaciones gubernamentales pensada primero para EE. UU. PMRFP es canadiense: licitaciones de edificios y propiedades de CanadaBuys, Toronto, Quebec y Yukon, más RFP privadas de administradores de propiedades que nunca publican en portales gubernamentales.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "≈US$500–$1,500 al año" },
      { feature: "Enfoque", pmrfp: "Trabajos de edificios y propiedades en Canadá: licitaciones públicas + RFP privadas", them: "Licitaciones gubernamentales" },
      { feature: "Directorio de proveedores", pmrfp: "Sí", them: "No" },
      { feature: "Nativo de Canadá", pmrfp: "Sí", them: "Principalmente EE. UU." },
    ],
    faqs: [
      { q: "¿PMRFP tiene licitaciones gubernamentales?", a: "Sí, para trabajos de edificios y propiedades: cada mañana PMRFP importa licitaciones abiertas de CanadaBuys, la Ciudad de Toronto, el SEAO de Quebec y Yukon, junto con RFP privadas de administradores de propiedades. BidNet cubre muchos más organismos de EE. UU." },
    ],
  },
  biddingo: {
    nameOf: "de Biddingo",
    tagline: "Plataforma canadiense de licitaciones del sector MASH.",
    whatItIs:
      "Biddingo es una plataforma creada en Canadá para las compras de municipios, juntas escolares y hospitales, con una sólida cobertura en Ontario.",
    whoFor: "Proveedores que presentan ofertas en licitaciones públicas canadienses o del sector MASH.",
    pricing: "Básico gratis; Premium ≈$499 CAD al año",
    strengths: ["Plataforma verdaderamente canadiense", "Sólida cobertura del sector MASH en Ontario", "Prueba gratuita"],
    weaknesses: [
      "Inclinado al gobierno y al sector MASH, no a las propiedades comerciales",
      "Sin directorio de proveedores ni marketing para empresas",
      "Pocas oportunidades del sector privado",
    ],
    angle:
      "Biddingo atiende al sector público. PMRFP atiende al mercado privado de propiedades comerciales, y le da a su empresa un perfil de marketing, no solo una bandeja de entrada de ofertas.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "≈$499 CAD al año" },
      { feature: "Enfoque", pmrfp: "Propiedades comerciales privadas", them: "MASH / sector público" },
      { feature: "Directorio de proveedores", pmrfp: "Sí", them: "No" },
      { feature: "Nativo de Canadá", pmrfp: "Sí", them: "Sí" },
    ],
    faqs: [
      { q: "¿PMRFP es más económico que Biddingo?", a: "Sí: $249 al año, tarifa fija, frente a unos $499 al año de Biddingo Premium, y PMRFP incluye una ficha en un directorio de proveedores con búsqueda." },
    ],
  },
  constructconnect: {
    nameOf: "de ConstructConnect",
    tagline: "La plataforma dominante de información de preconstrucción en Canadá.",
    whatItIs:
      "ConstructConnect (con Link2Build y el Daily Commercial News) sigue proyectos en preconstrucción, planos y permisos para contratistas generales, subcontratistas y proveedores.",
    whoFor: "Contratistas y proveedores que buscan oportunidades en proyectos de obra nueva.",
    pricing: "Cotización a medida: según se informa, ≈$1,500–$3,000+ al año (no se publica)",
    strengths: ["Datos detallados de proyectos en preconstrucción", "Credibilidad editorial (DCN)", "Amplia base de clientes en Canadá"],
    weaknesses: [
      "Caro: fuera del alcance de muchos contratistas pequeños",
      "Orientado a oportunidades de obra nueva, no a RFP de mantenimiento o renovación de propiedades",
      "Sin directorio de proveedores ni perfil de marketing",
    ],
    angle:
      "ConstructConnect sirve para perseguir obra nueva. PMRFP sirve para ganar el trabajo recurrente de mantenimiento, renovación y adecuación de interiores de quienes operan propiedades comerciales existentes: un mercado más estable y mucho más asequible para la mayoría de los contratistas.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "Cotización a medida (según se informa, ≈$1,500–$3,000+ al año)" },
      { feature: "Tipo de oportunidad", pmrfp: "RFP de propiedades existentes", them: "Preconstrucción de obra nueva" },
      { feature: "Directorio de proveedores", pmrfp: "Sí", them: "No" },
      { feature: "Costo de entrada", pmrfp: "Bajo, fijo", them: "Alto" },
    ],
    faqs: [
      { q: "¿Cuál debería elegir un contratista pequeño?", a: "Si quiere acceso asequible a trabajo recurrente en propiedades comerciales, PMRFP. Si tiene presupuesto para perseguir grandes proyectos de obra nueva, ConstructConnect. Responden a necesidades distintas." },
    ],
  },
  dodge: {
    nameOf: "de Dodge Construction Network",
    tagline: "Información de construcción de EE. UU. para grandes empresas.",
    whatItIs:
      "Dodge sigue más de 750,000 proyectos al año en Norteamérica para grandes contratistas generales, proveedores y subcontratistas que buscan oportunidades de preconstrucción.",
    whoFor: "Grandes empresas con presupuestos corporativos que buscan oportunidades de obra nueva.",
    pricing: "≈US$6,000–$12,000+ al año por usuario",
    strengths: ["Enorme base de datos de proyectos", "Información detallada", "Sólida cobertura en EE. UU."],
    weaknesses: [
      "Muy caro: cuesta más al año de lo que muchos contratistas ganan en un solo trabajo",
      "Centrado en EE. UU.; la cobertura de Canadá es secundaria",
      "Excesivo para contratistas pequeños y medianos; sin directorio de proveedores",
    ],
    angle:
      "Dodge cuesta más al año de lo que muchos contratistas pequeños ganan en un solo contrato. PMRFP está hecho específicamente para el mercado canadiense de propiedades comerciales, por una mínima fracción del precio.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "≈US$6,000–$12,000+ al año" },
      { feature: "Nativo de Canadá", pmrfp: "Sí", them: "Principalmente EE. UU." },
      { feature: "Accesible para contratistas pequeños", pmrfp: "Sí", them: "No" },
      { feature: "Directorio de proveedores", pmrfp: "Sí", them: "No" },
    ],
    faqs: [
      { q: "¿PMRFP es una alternativa a Dodge?", a: "Para los contratistas canadienses enfocados en trabajos de propiedades comerciales, PMRFP ofrece visibilidad en el directorio y RFP relevantes sin el precio corporativo de Dodge." },
    ],
  },
  trustedpros: {
    nameOf: "de TrustedPros",
    tagline: "Reseñas y clientes potenciales de contratistas residenciales en Canadá.",
    whatItIs:
      "TrustedPros es una plataforma canadiense de reseñas y clientes potenciales para contratistas, enfocada en los dueños de viviendas.",
    whoFor: "Dueños de viviendas que buscan contratistas.",
    pricing: "Suscripción + clientes potenciales (precios poco transparentes)",
    strengths: ["Nacido en Canadá", "Establecido desde 2004", "Perfiles y reseñas"],
    weaknesses: ["Solo residencial, nada comercial", "Calidad de los clientes potenciales cuestionada", "Precios poco claros"],
    angle:
      "TrustedPros es para renovaciones de viviendas. PMRFP es para propiedades comerciales: otro comprador, contratos más grandes y un estándar de credibilidad más alto.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "Poco claro, basado en clientes potenciales" },
      { feature: "Mercado", pmrfp: "Propiedades comerciales", them: "Residencial" },
      { feature: "Acceso a RFP", pmrfp: "Sí", them: "No" },
      { feature: "Comprador", pmrfp: "Administradores de propiedades / propietarios de inmuebles", them: "Dueños de viviendas" },
    ],
    faqs: [
      { q: "¿PMRFP me enviará clientes potenciales residenciales?", a: "No. PMRFP es solo para propiedades comerciales: administradores de propiedades, constructores y propietarios de inmuebles, no dueños de viviendas." },
    ],
  },
  homestars: {
    nameOf: "de HomeStars",
    tagline: "La mayor plataforma de reseñas de contratistas residenciales de Canadá.",
    whatItIs:
      "HomeStars (parte de Angi/IAC) es la mayor plataforma canadiense de reseñas y referencias de contratistas residenciales.",
    whoFor: "Dueños de viviendas; los contratistas pagan por cliente potencial o por suscripción.",
    pricing: "Pago por cliente potencial (≈$15–$85+ CAD por cliente potencial) + niveles de suscripción",
    strengths: ["La mayor plataforma canadiense entre consumidores y contratistas", "Reseñas sólidas", "Cobertura nacional"],
    weaknesses: [
      "Estrictamente residencial: sin enfoque en propiedades comerciales",
      "El pago por cliente potencial encarece los costos en los oficios con mucha competencia",
      "Sin funciones de RFP",
    ],
    angle:
      "HomeStars es para renovaciones de cocinas. PMRFP es para contratos comerciales de mantenimiento y adecuación de interiores que a menudo valen de 5 a 10 veces más por trabajo, con una tarifa fija en lugar de cargos por cliente potencial.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "Por cliente potencial, variable" },
      { feature: "Mercado", pmrfp: "Propiedades comerciales", them: "Residencial" },
      { feature: "Modelo de costo", pmrfp: "Anual fijo", them: "Pago por cliente potencial" },
      { feature: "Acceso a RFP", pmrfp: "Sí", them: "No" },
    ],
    faqs: [
      { q: "¿PMRFP es como HomeStars, pero para lo comercial?", a: "La idea es parecida (que lo descubran), pero PMRFP atiende a compradores de propiedades comerciales, agrega un tablero de RFP y cobra una tarifa fija de $249 al año en lugar de cobrar por cliente potencial." },
    ],
  },
  angi: {
    nameOf: "de Angi",
    tagline: "Mercado de servicios para el hogar de EE. UU.",
    whatItIs:
      "Angi (antes Angie's List) es un mercado de servicios para el hogar de EE. UU., que opera en Canadá principalmente a través de HomeStars.",
    whoFor: "Dueños de viviendas.",
    pricing: "Por cliente potencial (≈$15–$100+ CAD), a menudo compartidos",
    strengths: ["Gran marca norteamericana", "Amplia cobertura de oficios"],
    weaknesses: [
      "Centrado en EE. UU. y en lo residencial",
      "Clientes potenciales compartidos: el mismo cliente potencial llega a varios contratistas",
      "Modelo de pago por cliente potencial que molesta a muchos contratistas",
    ],
    angle:
      "Angi le envía el mismo cliente potencial compartido que recibieron otros cuatro contratistas. PMRFP lo conecta con administradores de propiedades que emiten RFP comerciales reales: usted compite por mérito y adecuación, no por quién devuelve la llamada más rápido.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "Por cliente potencial, variable" },
      { feature: "Oportunidades", pmrfp: "Expresar interés en RFP reales", them: "Clientes potenciales compartidos" },
      { feature: "Mercado", pmrfp: "Propiedades comerciales", them: "Residencial" },
      { feature: "Nativo de Canadá", pmrfp: "Sí", them: "Principalmente EE. UU." },
    ],
    faqs: [
      { q: "¿Las oportunidades de PMRFP son exclusivas?", a: "Las RFP están abiertas a los miembros calificados, pero usted responde directamente con su propia propuesta: no es un cliente potencial compartido enviado a decenas de contratistas." },
    ],
  },
  planhub: {
    nameOf: "de PlanHub",
    tagline: "Plataforma de ofertas para construcción comercial en EE. UU.",
    whatItIs:
      "PlanHub es una plataforma de ofertas en la nube de EE. UU. que conecta a contratistas generales y subcontratistas en proyectos de construcción comercial.",
    whoFor: "Contratistas generales y subcontratistas de construcción comercial en EE. UU.",
    pricing: "Subcontratistas: gratis a ≈US$1,199 al año; contratistas generales: a medida",
    strengths: ["Amplia base de datos de proyectos comerciales en EE. UU.", "Acceso gratuito para subcontratistas", "Interfaz moderna"],
    weaknesses: [
      "Principalmente el mercado de EE. UU.: poca cobertura en Canadá",
      "Enfoque en obra nueva, no en mantenimiento de propiedades",
      "Sin directorio de proveedores",
    ],
    angle:
      "PlanHub es una herramienta de EE. UU. para ofertas de construcción en EE. UU. PMRFP está creado en Canadá para quienes operan propiedades comerciales canadienses y el trabajo recurrente que adjudican.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "Gratis a ≈US$1,199 al año" },
      { feature: "Cobertura en Canadá", pmrfp: "Canadá primero", them: "Principalmente EE. UU." },
      { feature: "Tipo de oportunidad", pmrfp: "RFP de propiedades existentes", them: "Ofertas de obra nueva" },
      { feature: "Directorio de proveedores", pmrfp: "Sí", them: "No" },
    ],
    faqs: [
      { q: "¿PlanHub funciona en Canadá?", a: "Su cobertura se centra en EE. UU. Para trabajos de propiedades comerciales en Canadá, PMRFP está hecho a la medida." },
    ],
  },
  buildingconnected: {
    nameOf: "de BuildingConnected",
    tagline: "La red de ofertas de preconstrucción de Autodesk.",
    whatItIs:
      "BuildingConnected (propiedad de Autodesk) es una red de preconstrucción donde los contratistas generales gestionan invitaciones a ofertar y los subcontratistas reciben invitaciones.",
    whoFor: "Contratistas generales medianos y grandes y los subcontratistas que invitan, sobre todo en la construcción comercial de EE. UU.",
    pricing: "Subcontratistas: gratis (reactivo) o ≈US$149 al mes; contratistas generales: ≈US$3,600–$5,000+ al año",
    strengths: ["Más de 1 millón de profesionales", "Integración con Autodesk", "Estándar de la industria en la construcción comercial de EE. UU."],
    weaknesses: [
      "Reactivo para los subcontratistas: usted espera a que lo inviten",
      "Centrado en EE. UU.; Canadá es secundario",
      "Complejo y costoso para empresas pequeñas",
    ],
    angle:
      "Con BuildingConnected, alguien tiene que invitarlo. PMRFP le permite registrar su empresa de forma proactiva y responder a RFP abiertas de administradores de propiedades, sin esperar una invitación.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "Gratis a ≈US$149 al mes (subcontratistas)" },
      { feature: "Modelo de oportunidades", pmrfp: "Proactivo: RFP abiertas", them: "Solo por invitación" },
      { feature: "Cobertura en Canadá", pmrfp: "Canadá primero", them: "Principalmente EE. UU." },
      { feature: "Directorio de proveedores", pmrfp: "Sí", them: "No" },
    ],
    faqs: [
      { q: "¿Necesito una invitación para usar PMRFP?", a: "No. Usted registra su empresa y puede expresar interés en cualquier RFP abierta que le convenga, sin necesidad de invitación." },
    ],
  },
  "status-quo": {
    name: "el statu quo",
    nameOf: "del statu quo",
    tagline: "Recomendaciones, listas de proveedores preferidos y correo electrónico.",
    whatItIs:
      "Cómo se encuentran hoy la mayoría de los administradores de propiedades comerciales y los contratistas: el boca a boca, listas internas de proveedores, llamadas en frío y correo electrónico.",
    whoFor: "Todos los que aún no han encontrado un sistema mejor.",
    pricing: "Gratis en dinero, caro en tiempo y en oportunidades perdidas",
    strengths: ["Mucha confianza en las recomendaciones conocidas", "Sin suscripción", "Funciona para quienes ya están establecidos"],
    weaknesses: [
      "Si no está ya en una lista, es invisible",
      "Limitado por la geografía y poco transparente",
      "Sin referencia de precios competitivos ni proceso documentado",
    ],
    angle:
      "Si no está ya en la lista de proveedores preferidos de alguien, no existe. PMRFP crea una puerta de entrada para los contratistas que aún no tienen contactos, y ofrece a los administradores de propiedades una alternativa con búsqueda en lugar de su agenda de contactos.",
    rows: [
      { feature: "Precio anual", pmrfp: PRICE, them: "$0 (alto costo en tiempo)" },
      { feature: "Visibilidad para nuevos proveedores", pmrfp: "Sí", them: "No" },
      { feature: "Proceso competitivo de RFP", pmrfp: "Sí", them: "Poco común" },
      { feature: "Alcance en todo Canadá", pmrfp: "Sí", them: "Solo local" },
    ],
    faqs: [
      { q: "¿Por qué pagar si las recomendaciones funcionan?", a: "Las recomendaciones funcionan, hasta que se agotan. PMRFP es el segundo canal que mantiene llena su cartera de oportunidades cuando el boca a boca se calla, y abre puertas fuera de su red actual." },
    ],
  },
};
