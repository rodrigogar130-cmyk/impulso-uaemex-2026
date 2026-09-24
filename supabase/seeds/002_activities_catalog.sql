-- 67 actividades extraídas de la landing.
-- Solo abrir con fecha e inicio existentes.
-- Se puede repetir: no modifica filas existentes ni inscripciones.
begin;
do $$ begin
 if not exists(select 1 from public.events where slug='impulso-uaemex-2026') then
  raise exception 'Falta el evento IMPULSO UAEMÉX 2026';
 end if;
end $$;
insert into public.activities(event_id,slug,title,description,scenario,speaker,activity_date,start_time,end_time,location,status)
select e.id,v.slug,v.title,v.description,v.scenario,v.speaker,v.activity_date::date,v.start_time::time,v.end_time::time,v.location,v.status
from public.events e cross join (values
('001-inauguracion-del-festival','Inauguración del Festival','Asiste con ropa cómoda.','deporte','Gabinete; Directores ES; Directores SEVEPE','2026-10-15','09:00',null,'Estadio Universitario · espacio abierto','open'),
('002-innovacion-social','Innovación social',null,'investigacion','Humberto Alejandro Rosales Valbuena','2026-10-15','09:00','10:00','Facultad de Economía','open'),
('003-emprendiendo-a-traves-de-los-viajes','Emprendiendo a través de los viajes',null,'bienestar','Cyndi Hinojosa Frias','2026-10-15','09:30',null,'Turismo y Gastronomía · auditorio C.U.','open'),
('004-hackear-la-tradicion-el-patrimonio-cultural-como-la-startup-del-futuro','Hackear la Tradición: El patrimonio cultural como la startup del futuro','Sede por anunciar','cultura','Catalina Hermina Azuara Santillana','2026-10-15','10:00',null,'Ciencias Políticas y Sociales / Ágora de Cénide','open'),
('005-robotica-educativa','Robótica Educativa',null,'tecnologia','Rodrigo Lugo','2026-10-15','10:00',null,'Facultad de Ingeniería','open'),
('006-romper-el-molde-del-disenador-reactivo-al-creador-disruptivo','Romper el molde: Del diseñador reactivo al creador disruptivo',null,'diseno','Eduardo Victoria','2026-10-15','10:00',null,'Facultad de Arquitectura y Diseño','open'),
('007-legal-clinic-para-emprendedores','Legal Clinic para emprendedores',null,'gobernanza','Participantes por anunciar','2026-10-15','10:00',null,'Facultad de Derecho','open'),
('008-innovacion-social','Innovación social',null,'investigacion','William E. Mosquera Laverde; Alejandro García Garnica; Abel Anibal del Río Cortina; Felipe López; Carlos Santamaria','2026-10-15','10:00','11:00','Facultad de Economía','open'),
('009-inteligencia-artificial-y-narrativas-transmedia-para-proyectos-culturales','Inteligencia Artificial y Narrativas Transmedia para Proyectos Culturales','Sede por anunciar','cultura','Irma Bastida Herrera','2026-10-15','11:00',null,'Ciencias Políticas y Sociales / Ágora de Cénide','open'),
('010-el-deporte-y-las-empresas-deportivas-caso-tudn-y-galacticos','El deporte y las empresas deportivas. Caso TUDN y Galacticos','Presencial.','deporte','Marco Cancino','2026-10-15','11:00',null,'Estadio Universitario · gradas techadas','open'),
('011-automatizar-para-crecer','Automatizar para crecer',null,'tecnologia','Belem Gamboa','2026-10-15','11:00',null,'Facultad de Ingeniería','open'),
('012-la-legalidad-tambien-escala-negocios','La legalidad también escala negocios',null,'gobernanza','Alberto Cedillo','2026-10-15','11:00',null,'Facultad de Derecho','open'),
('013-mapa-emocional-collage-y-video-collage-de-proyeccion-a-futuro','Mapa emocional (collage) y video collage de proyección a futuro',null,'bienestar','Participantes por anunciar','2026-10-15','11:30',null,'Turismo y Gastronomía · explanada frente al auditorio','open'),
('014-ecosistemas-creativos-como-innovar-impulsar-y-trascender-en-la-cultura','Ecosistemas Creativos: ¿Cómo innovar, impulsar y trascender en la cultura?','Duración estimada: 40–50 minutos.
Sede por anunciar','cultura','Tomas Rivero Soteno; Irma Gloria Gabriela Ortiz Garrido; Omar Jaimes Esquivel','2026-10-15','12:00',null,'Ciencias Políticas y Sociales / Ágora de Cénide','open'),
('015-cyber-basics-ia-para-emprendedores-tecnologicos','Cyber Basics, IA para emprendedores tecnológicos',null,'tecnologia','Participantes por anunciar','2026-10-15','12:00',null,'Facultad de Ingeniería','open'),
('016-de-un-colectivo-local-a-una-plataforma-global-de-entretenimiento-cultural','De un colectivo local a una plataforma global de entretenimiento cultural','Sede por anunciar','cultura','Carlos Badillo Cruz','2026-10-15','13:00',null,'Ciencias Políticas y Sociales / Ágora de Cénide','open'),
('017-disciplina-en-el-deporte','Disciplina en el deporte','Modalidad y acceso: próximamente.','deporte','Margarita Hernández','2026-10-15','13:00',null,'Estadio Universitario · sala de prensa u oficinas','open'),
('018-ia-en-90-minutos-de-idea-a-prototipo','IA en 90 minutos: de idea a prototipo',null,'tecnologia','Manuel Jasso Sandoval','2026-10-15','13:00',null,'Facultad de Ingeniería','open'),
('019-ciberseguridad-el-nuevo-cinturon-de-seguridad-digital','Ciberseguridad: el nuevo cinturón de seguridad digital',null,'gobernanza','Participantes por anunciar','2026-10-15','13:00',null,'Facultad de Derecho','open'),
('020-ia-aplicada-productividad-etica-y-empleabilidad','IA aplicada: productividad, ética y empleabilidad',null,'tecnologia','Participantes por anunciar','2026-10-15','14:00',null,'Facultad de Ingeniería','open'),
('021-tribus-agiles-y-multiverso-agil','Tribus ágiles y multiverso ágil',null,'tecnologia','Ramon González Rodrígez','2026-10-15','15:00',null,'Facultad de Ingeniería','open'),
('022-startup-universitario-basada-en-software-o-ia','Startup universitario basada en software o IA','Expediente clínico digital · RIC.','tecnologia','Victor Andrés Alvaréz Domingue','2026-10-15','16:00',null,'Facultad de Ingeniería','open'),
('023-gobernanza-innovacion-publica-y-universidad','Gobernanza, innovación pública y universidad',null,'gobernanza','Participantes por anunciar','2026-10-15','16:00',null,'Facultad de Derecho','open'),
('024-viajar-cambia-tu-forma-de-emprender','Viajar cambia tu forma de emprender',null,'bienestar','Participantes por anunciar','2026-10-15','16:00',null,'Facultad de Turismo y Gastronomía · C.U. y El Rosedal','open'),
('025-pitch-para-ganar-sponsors','Pitch para ganar Sponsors','Modalidad y acceso: próximamente.','deporte','Víctor Pineda','2026-10-15','17:00',null,'Estadio Universitario · sala de prensa u oficinas','open'),
('026-campus-inteligente-campus-vivo','Campus inteligente, campus vivo','App UAEMéx. Participación del titular o de quien designe.','tecnologia','Jesús Javier Vallejo Silva','2026-10-15','17:00',null,'Facultad de Ingeniería','open'),
('027-emprendimiento-que-se-formalizo-y-logro-crecer','Emprendimiento que se formalizó y logró crecer',null,'gobernanza','Participantes por anunciar','2026-10-15','17:00',null,'Facultad de Derecho','open'),
('028-prototipado-rapido-de-modelos-de-negocio-con-ia-y-no-code','Prototipado rápido de modelos de negocio con IA y No-Code','Duración estimada: 60–90 minutos.','diseno','Santiago Navarrete Flores','2026-10-15',null,null,'Facultad de Arquitectura y Diseño','draft'),
('029-la-triple-helice-y-el-talento-joven-como-financiamos-y-escalamos-la-innovacion-creativa','La Triple Hélice y el Talento Joven: ¿Cómo financiamos y escalamos la innovación creativa?','Duración estimada: 40–50 minutos.','diseno','María Trinidad Contreras González; Alejandro Razo','2026-10-15',null,null,'Facultad de Arquitectura y Diseño','draft'),
('030-de-render-a-realidad-como-fundamos-un-estudio-de-arquitectura-modular-sostenible-y-rentable','De render a realidad: Cómo fundamos un estudio de arquitectura modular sostenible y rentable',null,'diseno','Mitzi Yareli Reyes Ramos','2026-10-15',null,null,'Facultad de Arquitectura y Diseño','draft'),
('031-fiscal-bootcamp-emprender-sin-miedo-al-sat','Fiscal Bootcamp: emprender sin miedo al SAT',null,'gobernanza','Participantes por anunciar','2026-10-15',null,null,'Facultad de Derecho','draft'),
('032-experiencias-de-viaje-a-tu-medida','Experiencias de viaje a tu medida','Cómo organizar tus viajes.','bienestar','Leslie Pastrana','2026-10-15',null,null,'Facultad de Turismo','draft'),
('033-warm-up','Warm-up','Asiste con ropa cómoda.','deporte','Edwin','2026-10-16','09:00',null,'Estadio Universitario · espacio abierto','open'),
('034-monedas-creativas-el-valor-intangible-que-el-mercado-esta-desesperado-por-comprar','Monedas Creativas: El valor intangible que el mercado está desesperado por comprar','Sede por anunciar','cultura','Tania Arzaluz','2026-10-16','10:00',null,'Ciencias Políticas y Sociales / Ágora de Cénide','open'),
('035-no-code-challenge-crea-una-app-sin-programar','No-Code Challenge: crea una app sin programar',null,'tecnologia','Carlos Rodrigo García Álvarez','2026-10-16','10:00',null,'Facultad de Ingeniería','open'),
('036-ciberseguridad-para-no-expertos','Ciberseguridad para no expertos',null,'gobernanza','Participantes por anunciar','2026-10-16','10:00',null,'Facultad de Derecho','open'),
('037-gastro-wellness-lab-comer-bien-para-pensar-mejor','Gastro Wellness Lab. Comer bien para pensar mejor',null,'bienestar','Nico','2026-10-16','10:00',null,'El Rosedal · Aula Servicio','open'),
('038-ecosistema-o-modelo-de-negocios','Ecosistema o Modelo de Negocios',null,'investigacion','Maestro Gudiño','2026-10-16','10:00','13:00','Facultad de Contaduría y Administración','open'),
('039-ingenieria-financiera-para-creativos-modelos-de-suscripcion-web3-y-crowdfunding','Ingeniería Financiera para Creativos: Modelos de suscripción, Web3 y Crowdfunding','Sede por anunciar','cultura','Participantes por anunciar','2026-10-16','11:00',null,'Ciencias Políticas y Sociales / Ágora de Cénide','open'),
('040-empresas-deportivas-caso-azteca-e-espn','Empresas deportivas. Caso Azteca e ESPN','Presencial.','deporte','Yisus','2026-10-16','11:00',null,'Estadio Universitario · gradas techadas','open'),
('041-la-ia-no-te-reemplaza-te-reta','La IA no te reemplaza, te reta',null,'tecnologia','Abraham García Aguilar','2026-10-16','11:00',null,'Facultad de Ingeniería','open'),
('042-gobernar-con-datos-servir-con-humanidad','Gobernar con datos, servir con humanidad',null,'gobernanza','Participantes por anunciar','2026-10-16','11:00',null,'Facultad de Derecho','open'),
('043-del-burnout-al-proposito','Del burnout al propósito',null,'bienestar','Mónica del Valle Pérez; Gloria Georgina Icaza Castro','2026-10-16','11:00',null,'El Rosedal · Aula Servicio','open'),
('044-inmersion-total-el-museo-galeria-interactiva-que-reinvento-el-consumo-cultural-urbano','Inmersión Total: El museo/galería interactiva que reinventó el consumo cultural urbano','Sede por anunciar','cultura','Estefania González Espinoza','2026-10-16','12:00',null,'Ciencias Políticas y Sociales / Ágora de Cénide','open'),
('045-automatiza-tu-emprendimiento-con-crm-y-dashboards','Automatiza tu emprendimiento con CRM y dashboards',null,'tecnologia','César Juárez Chávez','2026-10-16','12:00',null,'Facultad de Ingeniería','open'),
('046-direccion-y-trabajo-en-equipo','Dirección y trabajo en equipo','Modalidad y acceso: próximamente.','deporte','Atzimba; La Roca Zamora; Edgar Madrigal','2026-10-16','13:00',null,'Estadio Universitario · sala de prensa u oficinas','open'),
('047-movilidad-universitaria','Movilidad universitaria','App Potros Bus.','tecnologia','Pablo Goméz Lagunas','2026-10-16','13:00',null,'Facultad de Ingeniería','open'),
('048-del-tramite-al-servicio-el-derecho-centrado-en-personas','Del trámite al servicio: el derecho centrado en personas',null,'gobernanza','Eva Sales','2026-10-16','13:00',null,'Facultad de Derecho','open'),
('049-la-red-creativa-speed-dating-de-co-creacion','La Red Creativa: Speed Dating de Co-Creación','Sede por anunciar','cultura','Participantes por anunciar','2026-10-16','13:00','14:00','Ciencias Políticas y Sociales / Ágora de Cénide','open'),
('050-del-prototipo-al-mercado-como-escalar-software-universitario','Del prototipo al mercado: cómo escalar software universitario',null,'tecnologia','Guillermina Pérez Martínez','2026-10-16','14:00',null,'Facultad de Ingeniería','open'),
('051-civic-tech-lab-disena-un-servicio-publico-digital','Civic Tech Lab: diseña un servicio público digital',null,'gobernanza','Participantes por anunciar','2026-10-16','14:00',null,'Facultad de Derecho','open'),
('052-egresado-tech-en-empresa-global','Egresado tech en empresa global',null,'tecnologia','Euclydes Cadena Olivares','2026-10-16','15:00',null,'Facultad de Ingeniería','open'),
('053-automatizacion-de-actividades-escolares','Automatización de actividades escolares','App horario de clases docentes.','tecnologia','Participantes por anunciar','2026-10-16','16:00',null,'Facultad de Ingeniería','open'),
('054-formalizacion-inteligente-para-emprendedores','Formalización inteligente para emprendedores',null,'gobernanza','Participantes por anunciar','2026-10-16','16:00',null,'Facultad de Derecho','open'),
('055-formalizacion-inteligente-para-emprendedores','Formalización inteligente para emprendedores',null,'bienestar','Yolanda SEDECO','2026-10-16','16:00',null,'Facultad de Turismo y Gastronomía · C.U. y El Rosedal','open'),
('056-como-crear-tu-academia','Cómo crear tu academia','Academia de basketball.','deporte','Los trikis','2026-10-16','17:00',null,'Estadio Universitario','open'),
('057-app-de-movilidad','App de movilidad','Muevetex.','tecnologia','Regina Gorostieta','2026-10-16','17:00',null,'Facultad de Ingeniería','open'),
('058-proyecto-de-legaltech-o-govtech','Proyecto de legaltech o govtech',null,'gobernanza','Participantes por anunciar','2026-10-16','17:00',null,'Facultad de Derecho','open'),
('059-educacion-para-el-emprendimiento','Educación para el emprendimiento',null,'investigacion','Ricardo Carvalho','2026-10-16',null,null,'Facultad de Economía','draft'),
('060-presentacion-de-un-libro','Presentación de un Libro',null,'investigacion','Participantes por anunciar','2026-10-16',null,null,'Facultad de Economía','draft'),
('061-gobernanza-de-datos-e-ia-responsable','Gobernanza de datos e IA responsable',null,'gobernanza','Participantes por anunciar','2026-10-16',null,null,'Facultad de Derecho','draft'),
('062-disenar-para-el-fin-del-mundo-o-el-inicio-de-uno-nuevo','Diseñar para el fin del mundo (o el inicio de uno nuevo)',null,'diseno','Luis Anwar Albarran',null,null,null,'Facultad de Arquitectura y Diseño','draft'),
('063-diseno-de-experiencias-inmersivas-y-espacios-hibridos','Diseño de Experiencias Inmersivas y Espacios Híbridos','Duración estimada: 60–90 minutos.','diseno','Víctor Juaréz',null,null,null,'Facultad de Arquitectura y Diseño','draft'),
('064-fungitek-diseno-industrial-y-nuevos-materiales-la-clave-para-nuevos-mercados','Fungitek: Diseño industrial y nuevos materiales, la clave para nuevos mercados',null,'diseno','Omar Huerta',null,null,null,'En línea · acceso próximamente','draft'),
('065-la-red-disruptiva-speed-dating-de-proyectos','La Red Disruptiva: Speed Dating de Proyectos',null,'diseno','Participantes por anunciar',null,null,null,'Facultad de Arquitectura y Diseño','draft'),
('066-presentacion-de-libro-navegar-con-viento-propio-y-esencial-para-disenadores-emprendedores','Presentación de libro “Navegar con Viento Propio” y Esencial para Diseñadores Emprendedores','Duración estimada: 60 minutos.','diseno','María Trinidad Contreras González; Joaquin Trinidad Iduarte',null,null,null,'Facultad de Arquitectura y Diseño','draft'),
('067-interculturalidad','Interculturalidad',null,'bienestar','Nancy Bravo',null,null,null,'Facultad de Turismo','draft')
) as v(slug,title,description,scenario,speaker,activity_date,start_time,end_time,location,status)
where e.slug='impulso-uaemex-2026'
on conflict(event_id,slug) do nothing;
commit;
