/**
 * Spanish copy for the /for/[vertical] pages, picked by verticalsFor() /
 * getVerticalFor() in ./verticals.fr. Same shape as VERTICALS
 * (lib/seo/verticals), minus slugs and link targets, which stay in the English
 * data. `who` reads after "Para" ("Para los constructores, ..."). A vertical
 * without Spanish copy falls back to English.
 */
import type { VerticalCopy } from "./verticals.fr";

export const VERTICALS_ES: Record<string, VerticalCopy> = {
  builders: {
    name: "Constructores",
    who: "los constructores, promotores y contratistas generales",
    headline: "Reciba cotizaciones de subcontratistas en días, no tras semanas de llamadas.",
    positioning:
      "Publique cada paquete de subcontratación una sola vez, gratis. Los contratistas comerciales verificados que cubren su zona lo ven a la mañana siguiente y le expresan su interés. Compare sus perfiles, credenciales y trabajos anteriores en un solo lugar, y contrate a quien le convenga.",
    pains: [
      "Horas al teléfono buscando un subcontratista para cada oficio en cada obra",
      "Los mismos tres subcontratistas cotizan siempre, así que no hay presión sobre los precios",
      "No hay una forma rápida de comprobar la experiencia comercial o el seguro de un subcontratista nuevo",
      "Las cotizaciones llegan por mensaje de texto, correo y buzón de voz, en formatos distintos",
      "No queda ningún registro escrito cuando la relación con un subcontratista se complica",
    ],
    valueProps: [
      { title: "Publique una vez y reciba interés", desc: "Un paquete por oficio. Los contratistas que coinciden lo reciben en su correo de la mañana y le responden." },
      { title: "Más opciones que sus tres de siempre", desc: "Busque contratistas comerciales por oficio y región, con sus zonas de servicio y especialidades a la vista." },
      { title: "Credenciales antes de llamar", desc: "Los perfiles muestran seguros, compensación laboral (WSIB), años en el negocio, proyectos y quién los recomienda." },
      { title: "Vea por cuánto se vende el trabajo", desc: "Las adjudicaciones de contratos públicos muestran quién gana cerca de usted y a qué precio, para que sus presupuestos se sostengan." },
      { title: "Gratis para usted", desc: "Publicar, explorar y comparar no cuesta nada. Los contratistas pagan por el acceso, usted no." },
    ],
    features: ["Paquetes de subcontratación gratis", "Directorio por oficio y región", "Datos de adjudicaciones públicas", "Todas las respuestas en un solo lugar"],
    faqs: [
      { q: "Ya tenemos subcontratistas de confianza.", a: "Consérvelos. PMRFP es su lista de respaldo para cuando un subcontratista de confianza está ocupado, es demasiado caro o usted trabaja en una zona nueva." },
      { q: "¿Esto es solo una carrera por el precio más bajo?", a: "No. Usted elige según la adecuación, las credenciales y los trabajos anteriores. A nadie se le adjudica nada automáticamente." },
      { q: "¿Cuánto cuesta?", a: "Nada para constructores y contratistas generales. Publicar paquetes y explorar el directorio es gratis." },
      { q: "¿Cubren Estados Unidos?", a: "Sí. PMRFP cubre Canadá y Estados Unidos, y hoy el directorio de contratistas es más completo en el Área Metropolitana de Toronto." },
      { q: "¿En cuánto tiempo ven mi paquete los contratistas?", a: "Los contratistas que coinciden lo reciben en su correo de la mañana, el día después de que usted lo publica, y aparece en el tablero de inmediato." },
    ],
    cta: "Publicar un paquete de subcontratación",
    secondaryCta: "Explorar el directorio",
    metaTitle: "PMRFP para constructores: encuentre y contrate subcontratistas comerciales",
    metaDescription:
      "Constructores y promotores: publique gratis cada paquete de subcontratación y reciba el interés de subcontratistas comerciales verificados en Canadá y EE. UU. Compare credenciales y trabajos anteriores en un solo lugar.",
  },
  "general-contractors": {
    name: "Contratistas generales",
    who: "los contratistas generales que contratan subcontratistas",
    headline: "¿Ganó la obra? Reciba esta misma semana las cotizaciones de sus subcontratistas.",
    positioning:
      "Publique gratis un paquete para cada oficio que necesite: techado, electricidad, paneles de yeso. Los contratistas locales de ese oficio y esa región lo reciben en su correo de la mañana y le envían cotizaciones. Y como PMRFP importa a diario las adjudicaciones de contratos públicos, usted puede ver quién acaba de ganar trabajo público cerca de usted.",
    pains: [
      "Días al teléfono buscando subcontratistas para cada oficio de una obra nueva",
      "Los mismos pocos subcontratistas cotizan siempre, cuando tienen espacio",
      "No hay una forma fácil de revisar los trabajos anteriores de un subcontratista nuevo antes de contratarlo",
      "Las cotizaciones llegan por mensaje de texto, correo y buzón de voz, en formatos distintos",
      "Las obras públicas tienen plazos que no esperan a que le devuelvan la llamada",
    ],
    valueProps: [
      { title: "Publique paquetes de subcontratación gratis", desc: "Un paquete por oficio: alcance, obra y fecha límite de cotizaciones. Sin cuotas, sin contrato, sin cargos por cliente potencial." },
      { title: "Cotizaciones de contratistas locales", desc: "Los contratistas de ese oficio en esa región reciben su paquete en su correo diario y le responden a través de PMRFP." },
      { title: "Vea su trabajo primero", desc: "Los perfiles de los contratistas muestran fotos de trabajos y reseñas, además de seguros y compensación laboral (WSIB) cuando el contratista los ha agregado." },
      { title: "Vincule el contrato público que ganó", desc: "¿Viene de una adjudicación pública? Su paquete muestra el contrato, para que los contratistas sepan que la obra es real y está financiada." },
      { title: "Vea quién acaba de ganar trabajo público", desc: "Cada día agregamos nuevas adjudicaciones de contratos públicos: quién ganó, qué y por cuánto." },
    ],
    features: ["Paquetes de subcontratación", "Alertas diarias para contratistas", "Directorio de contratistas", "Adjudicaciones de contratos públicos", "Seguimiento del interés"],
    faqs: [
      { q: "¿Cuánto le cuesta a un contratista general?", a: "Nada. Publicar paquetes y explorar el directorio de contratistas es gratis para los contratistas generales. Los contratistas de oficios pagan la suscripción que les envía su paquete." },
      { q: "¿Quién ve mi paquete?", a: "Cualquiera puede ver el título, el resumen, la región y la fecha límite de cotizaciones. El alcance completo y sus datos de contacto llegan a los contratistas suscritos, y usted decide si sus datos de contacto se muestran o si los contratistas se comunican con usted a través de PMRFP." },
      { q: "¿Tengo que haber ganado un contrato público?", a: "No. Publique paquetes para cualquier obra que esté cotizando o ejecutando, privada o pública. Vincular una adjudicación pública es opcional." },
      { q: "¿PMRFP garantiza cotizaciones?", a: "No. PMRFP pone su paquete frente a los contratistas de ese oficio y esa región. No podemos prometer cuántos cotizarán." },
    ],
    cta: "Publicar un paquete de subcontratación — gratis",
    secondaryCta: "Ver quién acaba de ganar trabajo público",
    metaTitle: "Publique gratis paquetes de subcontratación — PMRFP para contratistas generales",
    metaDescription:
      "Contratistas generales: publique gratis un paquete de subcontratación por oficio y reciba cotizaciones de contratistas locales con fotos de trabajos y reseñas. Vea quién acaba de ganar contratos públicos cerca de usted.",
  },
  tradesmen: {
    name: "Contratistas de oficios",
    who: "los electricistas, técnicos de HVAC, techadores, empresas de limpieza, de remoción de nieve y más",
    headline: "Deje de esperar a que suene el teléfono.",
    positioning:
      "PMRFP es el directorio canadiense de contratistas comerciales: su ficha de $249 al año pone a su empresa frente a administradores de propiedades, promotores y constructores que buscan activamente su oficio en su ciudad.",
    pains: [
      "Las plataformas de licitaciones gubernamentales son burocráticas y casi todo es trabajo del sector público",
      "HomeStars y TrustedPros solo envían clientes potenciales residenciales: comprador equivocado, contrato del tamaño equivocado",
      "Llamar en frío a administradores de propiedades es lento y caro",
      "No hay forma de mostrar sus credenciales comerciales a nuevos clientes potenciales",
    ],
    valueProps: [
      { title: "Haga que lo descubran", desc: "Administradores de propiedades, constructores y propietarios exploran el directorio por oficio y ciudad: esté ahí cuando lo hagan." },
      { title: "RFP comerciales reales", desc: "Acceda al trabajo recurrente de mantenimiento, renovación y adecuación de interiores que paga con regularidad." },
      { title: "$249 al año, tarifa fija, no pago por cliente potencial", desc: "Visibilidad ilimitada por una tarifa anual predecible." },
      { title: "Muestre sus credenciales", desc: "Su perfil destaca seguros, compensación laboral (WSIB), zona de servicio, especialidades y tipos de proyecto." },
      { title: "Exprese interés directamente", desc: "Responda usted mismo a las oportunidades: sin intermediarios, sin pelear por clientes potenciales compartidos." },
    ],
    features: ["Ficha en el directorio", "Tablero de RFP", "Expresar interés", "Alertas de coincidencias", "Oportunidades guardadas"],
    faqs: [
      { q: "Me llega suficiente trabajo por recomendación.", a: "Por ahora. PMRFP es su póliza de seguro: un segundo canal para cuando se agoten las recomendaciones." },
      { q: "¿PMRFP garantiza contratos?", a: "No. PMRFP ofrece visibilidad y acceso a oportunidades, no adjudicaciones, respuestas ni ingresos garantizados." },
    ],
    cta: "Registre su empresa — $249 al año",
    secondaryCta: "Ver precios",
    metaTitle: "PMRFP para contratistas de oficios — Gane trabajo en propiedades comerciales en Canadá",
    metaDescription:
      "Contratistas de oficios: aparezca donde buscan los administradores de propiedades, acceda a RFP comerciales y gane trabajo recurrente. $249 CAD al año, tarifa fija, no pago por cliente potencial.",
  },
  "sales-teams": {
    name: "Equipos de ventas",
    who: "los representantes de desarrollo de negocios de empresas de oficios y proveedores",
    headline: "Su próximo contrato comercial ya está publicado.",
    positioning:
      "Para los representantes de desarrollo de negocios de empresas de oficios y proveedores, PMRFP es un flujo en vivo de RFP de propiedades comerciales, junto con visibilidad en el directorio que lo pone en la lista corta incluso antes de que se emita la RFP.",
    pains: [
      "Una cartera de oportunidades escasa e irregular que depende demasiado de las cuentas existentes",
      "Horas perdidas persiguiendo oportunidades gubernamentales o de obra nueva que no encajan con su especialidad",
      "No hay una fuente central de RFP privadas de propiedades comerciales en Ontario",
      "Es difícil demostrar credenciales y trabajos anteriores a prospectos que no lo conocen",
      "Ciclos de venta largos con empresas de administración de propiedades",
    ],
    valueProps: [
      { title: "Sea visible antes de la RFP", desc: "Los administradores de propiedades exploran el directorio cuando arman su lista corta: haga que lo encuentren temprano." },
      { title: "Una cartera real", desc: "El tablero de RFP es un flujo estructurado y accionable de oportunidades privadas vigentes." },
      { title: "Presupuesto comercial predecible", desc: "Un costo anual fijo es mejor que un gasto impredecible por cliente potencial." },
      { title: "Una carta de capacidades siempre actualizada", desc: "El perfil de su empresa está a la vista de cada operador de propiedades registrado." },
      { title: "Más cálido que el contacto en frío", desc: "Expresar interés convierte más rápido que llamar en frío a un administrador que nunca ha oído hablar de usted." },
    ],
    features: ["Ficha en el directorio", "Alertas de RFP por oficio y región", "Expresar interés", "Gestión del perfil de la empresa"],
    faqs: [
      { q: "Nuestra empresa ya está en algunas listas de administradores.", a: "¿Está en todas? PMRFP lo expone a administradores de propiedades fuera de su red actual, sobre todo a carteras medianas." },
      { q: "¿Cómo medimos el retorno de la inversión?", a: "Un solo contrato nuevo de mantenimiento comercial suele pagar la tarifa anual muchas veces." },
    ],
    cta: "Agregar su empresa",
    secondaryCta: "Ver oportunidades",
    metaTitle: "PMRFP para equipos de ventas — Una cartera de RFP comerciales para contratistas",
    metaDescription:
      "Representantes de ventas y desarrollo de negocios de empresas de oficios: un flujo en vivo de RFP de propiedades comerciales en Canadá, más visibilidad en el directorio para entrar temprano en las listas cortas. Tarifa anual fija.",
  },
  investors: {
    name: "Inversionistas y propietarios de inmuebles",
    who: "los inversionistas inmobiliarios y propietarios de carteras",
    headline: "Su cartera merece mejores proveedores que el primero que contesta.",
    positioning:
      "PMRFP ofrece a los inversionistas inmobiliarios y a los propietarios un directorio de contratistas comerciales con búsqueda y credenciales, para que usted deje de depender de a quien le recomendó su último administrador de propiedades.",
    pains: [
      "Encontrar contratistas calificados para propiedades comerciales toma demasiado tiempo",
      "Las listas de proveedores preferidos son opacas, no están verificadas y no se trasladan de una propiedad a otra",
      "No hay una forma estructurada de pedir cotizaciones competitivas para mantenimiento o inversiones de capital",
      "Se pagan tarifas por encima del mercado sin presión competitiva sobre los proveedores actuales",
      "Las brechas de credenciales y cumplimiento generan exposición en seguros y responsabilidad civil",
    ],
    valueProps: [
      { title: "Explore contratistas verificados", desc: "Busque por categoría, región y credencial, gratis." },
      { title: "Lleve un proceso real", desc: "Publique una RFP para cualquier propiedad y reciba propuestas estructuradas." },
      { title: "Transparencia de precios", desc: "Un proceso competitivo saca a la luz precios y alcances justos." },
      { title: "Reduzca su riesgo", desc: "Los perfiles muestran seguros, licencias y trabajos anteriores para reducir su exposición a responsabilidades." },
      { title: "Gratis del lado de la demanda", desc: "Publicar o explorar no les cuesta nada a los propietarios ni a los inversionistas." },
    ],
    features: ["Exploración del directorio", "Publicación de RFP", "Preselección de proveedores", "Credenciales visibles"],
    faqs: [
      { q: "Mi administrador de propiedades se encarga de esto.", a: "PMRFP complementa a su administrador: es la herramienta que puede usar para encontrar proveedores calificados para sus activos." },
      { q: "Solo tengo unas pocas propiedades.", a: "PMRFP es gratis del lado de la demanda: publicar una RFP o explorar proveedores no cuesta nada." },
    ],
    cta: "Explorar el directorio",
    secondaryCta: "Publicar una RFP",
    metaTitle: "PMRFP para inversionistas inmobiliarios — Encuentre proveedores comerciales verificados en Canadá",
    metaDescription:
      "Inversionistas y propietarios de inmuebles: explore un directorio de contratistas comerciales con credenciales y lleve a cabo RFP competitivas para su cartera. Publicar y explorar es gratis.",
  },
  "real-estate": {
    name: "Profesionales inmobiliarios",
    who: "los agentes inmobiliarios, corredurías e inversionistas inmobiliarios",
    headline: "Sus contratistas de confianza. Su nombre. Un solo enlace.",
    positioning:
      "Guarde los contratistas en los que confía en una página con su nombre y envíe a sus clientes un solo enlace por mensaje de texto en lugar de un número de memoria. Detrás: un directorio de contratistas comerciales y residenciales con credenciales, y una forma sencilla de publicar las reparaciones antes de la venta, la preparación de unidades entre inquilinos y el mantenimiento que protegen una operación.",
    pains: [
      "Las reparaciones antes de poner en venta frenan la operación mientras usted busca un contratista confiable",
      "El mismo técnico de reparaciones sobrecargado retrasa cada propiedad en venta y cada cambio de inquilino",
      "No tiene contratistas verificados a mano cuando una operación necesita trabajos antes del cierre",
      "El mantenimiento de la cartera es reactivo y está repartido entre contactos personales",
      "No hay registro escrito ni credenciales cuando la relación con un proveedor se complica",
    ],
    valueProps: [
      { title: "Su página de contratistas de confianza", desc: "Guarde los contratistas en los que confía, agregue una nota a cada uno y envíe a sus clientes un solo enlace en lugar de un número de teléfono de memoria. Gratis para 5 contratistas." },
      { title: "Contratistas verificados cuando los necesite", desc: "Busque contratistas comerciales y residenciales por categoría, región y credencial, gratis." },
      { title: "Publique el trabajo una vez", desc: "Reparaciones antes de la venta, preparación de unidades o proyectos de capital: publique una RFP y responderán contratistas calificados." },
      { title: "Cierre operaciones más rápido", desc: "Que la falta de un contratista ya no retrase un cierre ni una nueva puesta en venta." },
      { title: "Credenciales a la vista", desc: "Los perfiles muestran seguros, licencias y trabajos anteriores para reducir su riesgo." },
      { title: "Gratis del lado de la demanda", desc: "Publicar o explorar no les cuesta nada a los agentes, las corredurías ni los inversionistas." },
    ],
    features: ["Página de contratistas de confianza para compartir", "Búsqueda en el directorio por oficio y región", "Publicación de RFP", "Credenciales visibles"],
    faqs: [
      { q: "¿Esto es para comprar o vender casas?", a: "No. PMRFP no es un sitio de listados inmobiliarios. Lo conecta con los contratistas que hacen el trabajo en las propiedades: reparaciones, preparación de unidades, renovaciones y mantenimiento." },
      { q: "Ya tengo un técnico de reparaciones.", a: "Muy bien. PMRFP es su respaldo para cuando esté ocupado, el trabajo lo supere o la propiedad esté en otra ciudad." },
      { q: "¿Cuánto cuesta la página de contratistas de confianza?", a: "Es gratis hasta 5 contratistas. Realtor Pro cuesta $249 CAD al año: contratistas ilimitados, más su teléfono y correo en la página para que cada cliente que la abra pueda comunicarse con usted." },
    ],
    cta: "Crear su página de contratistas de confianza",
    secondaryCta: "Explorar el directorio",
    metaTitle: "PMRFP para bienes raíces — Encuentre contratistas verificados para propiedades en venta y carteras",
    metaDescription:
      "Agentes inmobiliarios, corredurías e inversionistas: explore un directorio de contratistas comerciales y residenciales con credenciales y publique reparaciones antes de la venta, preparación de unidades y mantenimiento. Publicar y explorar es gratis.",
  },
  "condo-boards": {
    name: "Juntas de condominio",
    who: "las juntas de condominio y las asociaciones autogestionadas",
    headline: "Demuestre a los propietarios que siguió un proceso justo, no solo una llamada.",
    positioning:
      "PMRFP permite a una junta de condominio llevar a cabo una RFP abierta y documentada, y mostrar a los propietarios exactamente cómo se eligió a un proveedor: ofertas competitivas, con registro. Compras transparentes, como se espera que funcionen las buenas juntas.",
    pains: [
      "Los propietarios cuestionan la elección de proveedores en la asamblea anual, y no hay un registro escrito que mostrar",
      "El mismo contratista gana todos los años sin cotización competitiva",
      "Buscar contratistas para un proyecto recae en directores voluntarios que tienen su propio empleo",
      "No hay un proceso documentado que respalde una decisión fiduciaria o una solicitud de acceso a los registros",
      "Se adjudican trabajos de capital y mantenimiento sin que los propietarios vean las alternativas",
    ],
    valueProps: [
      { title: "Un proceso competitivo documentado", desc: "Publique un proyecto, reciba ofertas y conserve un registro claro de quién ofertó y por qué eligió a quien eligió." },
      { title: "Transparencia que los propietarios pueden ver", desc: "Demuestre a la asociación que siguió un proceso abierto, no un apretón de manos con un solo proveedor." },
      { title: "Contratistas verificados cuando los necesite", desc: "Contacte a contratistas comerciales por categoría y región, con sus credenciales a la vista." },
      { title: "Publicar es gratis", desc: "Publicar un proyecto y recibir ofertas no le cuesta nada a la asociación." },
      { title: "Hecho también para juntas autogestionadas", desc: "No se necesita un administrador de propiedades: una junta puede llevar todo el proceso por sí misma." },
    ],
    features: ["Publicación de RFP", "Registro documentado de ofertas", "Directorio por oficio y región", "Credenciales visibles"],
    faqs: [
      { q: "Nuestro administrador de propiedades se encarga de los proveedores.", a: "Bien. PMRFP es la herramienta que su administrador (o su junta) usa para llevar un proceso competitivo que puede mostrar a los propietarios. Refuerza la recomendación del administrador, no la reemplaza." },
      { q: "¿La ley exige ofertas competitivas?", a: "No. Solicitar ofertas competitivas documentadas es una buena práctica de gobernanza que cada vez más se espera de las juntas, no un requisito legal. PMRFP simplemente lo hace fácil." },
      { q: "Somos autogestionados.", a: "PMRFP está hecho para eso: una junta de voluntarios puede publicar un proyecto, recibir ofertas de contratistas verificados y conservar el registro, sin contratar a nadie." },
    ],
    cta: "Publicar un proyecto — gratis",
    secondaryCta: "Explorar contratistas verificados",
    metaTitle: "PMRFP para juntas de condominio — Ofertas competitivas transparentes que puede mostrar a los propietarios",
    metaDescription:
      "Juntas de condominio y asociaciones autogestionadas: lleve a cabo una RFP abierta y documentada, reciba ofertas competitivas de contratistas verificados y muestre a los propietarios un proceso justo. Publicar es gratis.",
  },
  suppliers: {
    name: "Proveedores y distribuidores",
    who: "los proveedores de productos, materiales y equipos de construcción",
    headline: "Llegue a los contratistas y constructores que compran lo que usted vende.",
    positioning:
      "PMRFP incluye a los proveedores de productos, materiales y equipos de construcción en un directorio con búsqueda y da a conocer proyectos comerciales, para que los contratistas, constructores y administradores de propiedades que buscan sus productos puedan encontrarlo.",
    pains: [
      "Conseguir nuevas cuentas de contratistas y constructores comerciales es lento y depende de los representantes",
      "No hay un lugar central donde los compradores comerciales canadienses busquen proveedores",
      "Es difícil mostrar su catálogo y sus credenciales a los compradores adecuados",
      "La visibilidad de proyectos y RFP la tienen los contratistas generales, no los proveedores",
      "Gasto en marketing con pocas señales de quién compra realmente",
    ],
    valueProps: [
      { title: "Que los compradores lo descubran", desc: "Contratistas, constructores y administradores de propiedades exploran el directorio por categoría y región: esté ahí cuando busquen." },
      { title: "Vea la demanda de proyectos en vivo", desc: "Siga las RFP comerciales para detectar proyectos que necesitarán sus productos." },
      { title: "Tarifa anual fija", desc: "Un costo predecible, no pago por cliente potencial ni publicidad por impresión." },
      { title: "Muestre su catálogo y sus condiciones", desc: "Su perfil destaca categorías de productos, zona de servicio y detalles de cuentas para contratistas." },
      { title: "Construya el lado de proveedores de la red", desc: "Esté junto a los contratistas y constructores que ya atiende, en un solo mercado comercial canadiense." },
    ],
    features: ["Ficha en el directorio", "Segmentación por categoría y región", "Visibilidad de RFP", "Perfil de la empresa", "Insignia de verificado"],
    faqs: [
      { q: "¿PMRFP es solo para contratistas?", a: "No. Los proveedores y distribuidores aparecen junto a los contratistas: el mismo directorio y la misma membresía Pro, ajustados para que los compradores comerciales encuentren lo que usted vende." },
      { q: "¿Cómo usan las RFP los proveedores?", a: "La visibilidad de las RFP le ayuda a detectar próximos proyectos comerciales que necesitarán materiales o equipos, para llegar temprano a los contratistas adecuados." },
    ],
    cta: "Registre su empresa",
    secondaryCta: "Explorar el directorio de proveedores",
    metaTitle: "PMRFP para proveedores — Llegue a contratistas y constructores comerciales en Canadá",
    metaDescription:
      "Proveedores de productos y materiales de construcción: aparezca donde los contratistas, constructores y administradores de propiedades comerciales de Canadá buscan productos, y siga la demanda de proyectos. Tarifa anual fija.",
  },
};
