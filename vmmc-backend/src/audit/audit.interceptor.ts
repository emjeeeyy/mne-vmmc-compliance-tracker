import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { RequestWithEmployee } from '../auth/types/request-with-employee';
import { AuditService } from './audit.service';

const SKIPPED_PREFIXES = ['/api/health', '/api/auth', '/api/docs'];

/**
 * The `me` module fans out into many distinct personal sub-resources (profile, devices,
 * activity logs, login history, ...) that all shared one `'me'` entity_type before, so the
 * Activity Logs feed showed a wall of identical "Accessed Profile" entries for what were
 * actually different pages/actions. Every other module already maps 1:1 to a meaningful
 * label, so only `me` needs the extra segment.
 */
export function deriveEntityType(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const module = segments[1] ?? 'unknown'; // segments[0] is 'api'
  if (module === 'me' && segments[2]) return `me-${segments[2]}`;
  return module;
}

function actionForMethod(method: string): string {
  switch (method) {
    case 'POST':
      return 'CREATE';
    case 'PATCH':
    case 'PUT':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return 'ACCESS';
  }
}

/**
 * Global request auditor. Guards run before interceptors, so a coarse
 * `@Roles()` rejection never reaches here — but fine-grained, in-handler
 * access checks (e.g. ComplianceRecordService.assertDossierAccess throwing
 * ForbiddenException on a cross-employee read) run inside the handler and
 * ARE observable here, so those denials get audit-logged too.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithEmployee>();
    const path: string = request.originalUrl?.split('?')[0] ?? request.url;
    if (SKIPPED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return next.handle();
    }

    const actorId = request.employee?.id ?? null;
    if (!actorId) return next.handle();

    const entityType = deriveEntityType(path);
    const entityId = (request.params?.id ?? request.params?.employeeId ?? null) as string | null;
    const ipAddress = request.ip ?? null;
    const userAgent = request.headers['user-agent'] ?? null;
    const action = actionForMethod(request.method);

    return next.handle().pipe(
      tap(() => {
        this.auditService.log({ actorId, action, entityType, entityId, ipAddress, userAgent }).catch(() => {});
      }),
      catchError((err: unknown) => {
        if (err instanceof ForbiddenException) {
          this.auditService
            .log({ actorId, action: 'ACCESS_DENIED', entityType, entityId, ipAddress, userAgent })
            .catch(() => {});
        }
        return throwError(() => err);
      }),
    );
  }
}
