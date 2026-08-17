import { Request } from 'express';
import { EmployeeContext } from './role';

export interface RequestWithEmployee extends Request {
  employee: EmployeeContext;
}
