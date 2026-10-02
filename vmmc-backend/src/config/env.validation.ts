import { Type, plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  PORT = 8443;

  @IsString()
  @IsOptional()
  CORS_ORIGIN = 'http://localhost:3000';

  @IsString()
  @IsOptional()
  SUPABASE_URL?: string;

  @IsString()
  @IsOptional()
  SUPABASE_SERVICE_ROLE_KEY?: string;

  @IsString()
  @IsOptional()
  SUPABASE_ANON_KEY?: string;

  @IsString()
  @IsOptional()
  RESET_TOKEN_SECRET?: string;

  @IsString()
  @IsOptional()
  SEED_DEMO_PASSWORD?: string;

  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  SMTP_PORT?: number;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASSWORD?: string;

  @IsString()
  @IsOptional()
  SEMAPHORE_API_KEY?: string;

  @IsString()
  @IsOptional()
  SEMAPHORE_SENDER_NAME?: string;
}

/** Decodes a Supabase JWT's payload (no signature check) just to read its `role` claim. */
function decodeSupabaseKeyRole(key: string): string | undefined {
  const parts = key.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as {
      role?: string;
    };
    return payload.role;
  } catch {
    return undefined;
  }
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  // Flag an anon-vs-service-role key swap before it silently grants the wrong privileges.
  const serviceRole = validatedConfig.SUPABASE_SERVICE_ROLE_KEY;
  const anon = validatedConfig.SUPABASE_ANON_KEY;
  if (serviceRole) {
    const role = decodeSupabaseKeyRole(serviceRole);
    if (role && role !== 'service_role') {
      throw new Error(
        `SUPABASE_SERVICE_ROLE_KEY does not decode to role "service_role" (got "${role}") — check for an anon/service-role key swap.`,
      );
    }
  }
  if (anon) {
    const role = decodeSupabaseKeyRole(anon);
    if (role && role !== 'anon') {
      throw new Error(
        `SUPABASE_ANON_KEY does not decode to role "anon" (got "${role}") — check for an anon/service-role key swap.`,
      );
    }
  }
  if (serviceRole && anon && serviceRole === anon) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY must not be identical.');
  }

  return validatedConfig;
}
