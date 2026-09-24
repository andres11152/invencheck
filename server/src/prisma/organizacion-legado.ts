/**
 * Id literal de la organización que heredó todos los datos preexistentes al
 * convertir la app a multi-tenant (ver la migración
 * `20260808130000_organizacion_multi_tenant`). Estable a propósito: el seed,
 * los scripts CLI y los fixtures de e2e lo referencian por constante en vez
 * de tener que resolverlo por nombre/slug en cada arranque.
 */
export const ORGANIZACION_LEGADO_ID = 'org-legacy';
export const ORGANIZACION_LEGADO_SLUG = 'legacy';
