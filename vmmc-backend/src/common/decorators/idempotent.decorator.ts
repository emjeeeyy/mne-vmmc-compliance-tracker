import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

/**
 * Documents the Idempotency-Key convention (§5 / Phase 3.5): apply to every
 * write endpoint (POST/PATCH) that creates or mutates a record, so a client
 * retry after a timeout never duplicates it. The header itself is optional
 * at the HTTP level — each write endpoint's service is responsible for
 * upserting/deduping on it (e.g. documents.idempotency_key from Phase 1).
 */
export function Idempotent() {
  return applyDecorators(
    ApiHeader({
      name: 'Idempotency-Key',
      required: false,
      description: 'Client-generated key so a retried request never creates a duplicate record.',
    }),
  );
}
