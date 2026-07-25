// `@Type()` de class-transformer necesita Reflect.getMetadata en runtime. En
// la app real ya llega polyfillado transitivamente al bootstrapear Nest,
// pero este módulo también se importa solo (env.validation.spec.ts, sin
// Nest de por medio) — se declara explícito acá para no depender de ese
// orden de carga implícito.
import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Única fuente de verdad de qué variables de entorno existen, cuáles son
 * requeridas y sus defaults — reemplaza la validación que antes vivía
 * repartida en 3 lugares distintos: `main.ts` (chequeo manual antes de
 * arrancar), `jwt.strategy.ts` (throw en su propio constructor) y
 * `api-key.guard.ts` (throw en cada request si faltaba la key). Si algo
 * requerido falta o tiene el tipo equivocado, la app no arranca — no hay
 * forma de que llegue a producción a medio configurar, y no hay que
 * recordar mantener 3 validaciones distintas en sync.
 */
export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_EXPIRES_IN_SECONDS?: number;

  @IsString()
  @IsNotEmpty()
  ERP_WEBHOOK_API_KEY!: string;

  @IsOptional()
  @IsString()
  GEMINI_API_KEY?: string;

  @IsOptional()
  @IsString()
  GEMINI_MODEL?: string;

  @IsOptional()
  @IsString()
  GEMINI_SYSTEM_PROMPT?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  GEMINI_MAX_RETRIES?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  GEMINI_BASE_DELAY_MS?: number;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  ERP_INTEGRATION_URL?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  PORT?: number;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detalle = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n');
    throw new Error(
      `Configuración de entorno inválida — revisa .env.example:\n${detalle}`,
    );
  }
  return validated;
}
