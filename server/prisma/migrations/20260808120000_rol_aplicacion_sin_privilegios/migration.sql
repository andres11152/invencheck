-- Rol con el que se conecta el PROCESO DE LA APLICACIÓN, separado del rol
-- dueño de las tablas con el que corren migraciones, seed y scripts CLI.
--
-- Por qué hacen falta dos roles: las policies de Row Level Security que se
-- habilitan más adelante (migración _rls_aislamiento_organizacion) NO se
-- aplican ni al dueño de la tabla ni a un superusuario. El rol por defecto
-- de docker-compose (`invencheck`) es superusuario, así que si la app
-- siguiera conectándose con él, todas las policies quedarían INERTES: los
-- tests de aislamiento entre organizaciones pasarían en verde mientras
-- producción filtra datos entre clientes. `PrismaService.onModuleInit` se
-- niega a arrancar si detecta ese caso (`verificarRolNoPrivilegiado`).
--
-- Deliberadamente NO se usa `FORCE ROW LEVEL SECURITY`: el bypass del dueño
-- es justo lo que permite que `prisma migrate deploy` y `prisma db seed`
-- funcionen sin casos especiales. La garantía que daría FORCE la da la
-- verificación de arranque, que además cubre el caso superusuario — que
-- FORCE no cubre.
--
-- NOTA DE DESPLIEGUE: la contraseña de abajo es solo para desarrollo local y
-- CI, igual que las credenciales de docker-compose.yml. En cualquier
-- ambiente real hay que rotarla (`ALTER ROLE invencheck_app PASSWORD '...'`)
-- y poner la nueva en DATABASE_URL. El rol que corre esta migración necesita
-- CREATEROLE o ser superusuario.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'invencheck_app') THEN
    CREATE ROLE invencheck_app
      LOGIN PASSWORD 'invencheck_app'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    -- Idempotencia: si el rol ya existía (base recreada sobre un volumen
    -- viejo), reafirmar los atributos que hacen que RLS lo alcance.
    ALTER ROLE invencheck_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO invencheck_app;

-- Sin DDL: la app no crea ni altera tablas, solo lee y escribe filas.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO invencheck_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO invencheck_app;

-- Para que las tablas que creen las migraciones FUTURAS queden accesibles
-- sin tener que repetir el GRANT en cada una. Aplica a los objetos que cree
-- el rol actual (el dueño), que es quien corre las migraciones.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO invencheck_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO invencheck_app;

-- Usada por el matching difuso de voz (ArticuloRepository.findBestMatches).
GRANT EXECUTE ON FUNCTION public.f_unaccent(text) TO invencheck_app;
