import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { DocumentsController } from './documents.controller';

describe('DocumentsController — who may call what', () => {
  it('PATCH /documents/:id/review is ADMIN-only at the route level, not just inside the service', () => {
    // Clearing someone is a signed sign-off by the TB DOTS administrator. A unit head was once allowed here, which
    // gave them a reject-only half-feature (approving needs a signature and only admins can save one). The service
    // refuses non-admins too; this guards the decorator so the route itself cannot quietly widen again.
    expect(Reflect.getMetadata(ROLES_KEY, DocumentsController.prototype.review)).toEqual(['ADMIN']);
  });
});
