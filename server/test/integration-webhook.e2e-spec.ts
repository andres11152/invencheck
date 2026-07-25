import { UnidadMedida } from '../src/generated/prisma/client';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from './utils/test-app';
import { truncateAll } from './utils/db-reset';
import { agent } from './utils/http';

interface WebhookResponseBody {
  success: boolean;
}

describe('Webhooks de integración ERP (e2e)', () => {
  let ctx: TestAppContext;
  const apiKey = process.env.ERP_WEBHOOK_API_KEY!;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  afterEach(async () => {
    await truncateAll(ctx.prisma);
  });

  describe('POST /integration/webhook/sync-articulo', () => {
    const payload = [
      {
        nombre: 'ARTICULO SINCRONIZADO ERP',
        categoria: 'Abarrotes',
        unidadEstd: UnidadMedida.UNIDAD,
      },
    ];

    it('rechaza sin X-Api-Key con 401', async () => {
      await agent(ctx.app)
        .post('/api/integration/webhook/sync-articulo')
        .send(payload)
        .expect(401);
    });

    it('rechaza con una key incorrecta con 401', async () => {
      await agent(ctx.app)
        .post('/api/integration/webhook/sync-articulo')
        .set('X-Api-Key', 'key-incorrecta')
        .send(payload)
        .expect(401);
    });

    it('acepta con la key correcta y persiste el artículo', async () => {
      const res = await agent(ctx.app)
        .post('/api/integration/webhook/sync-articulo')
        .set('X-Api-Key', apiKey)
        .send(payload)
        .expect(200);
      const body = res.body as WebhookResponseBody;

      expect(body.success).toBe(true);

      const articulo = await ctx.prisma.articulo.findUnique({
        where: { nombre: 'ARTICULO SINCRONIZADO ERP' },
      });
      expect(articulo).not.toBeNull();
      expect(articulo!.categoria).toBe('Abarrotes');
    });
  });

  describe('POST /integration/webhook/sync-almacen', () => {
    const payload = [
      {
        codigo: 'BOD-ERP-TEST',
        nombre: 'Bodega Sincronizada ERP',
        unidad: 'Test',
      },
    ];

    it('rechaza sin X-Api-Key con 401', async () => {
      await agent(ctx.app)
        .post('/api/integration/webhook/sync-almacen')
        .send(payload)
        .expect(401);
    });

    it('acepta con la key correcta y persiste el almacén', async () => {
      const res = await agent(ctx.app)
        .post('/api/integration/webhook/sync-almacen')
        .set('X-Api-Key', apiKey)
        .send(payload)
        .expect(200);
      const body = res.body as WebhookResponseBody;

      expect(body.success).toBe(true);

      const almacen = await ctx.prisma.almacen.findUnique({
        where: { codigo: 'BOD-ERP-TEST' },
      });
      expect(almacen).not.toBeNull();
    });
  });
});
