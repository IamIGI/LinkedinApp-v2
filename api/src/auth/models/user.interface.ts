import { Role } from './role.enum';

export interface User {
  id?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  profileImagePath?: string;
  profileFullImagePath?: string;
  backgroundImagePath?: string;
  backgroundFullImagePath?: string;
  role?: Role;
  isPrivateAccount?: boolean;
  company?: string;
  education?: string;
  position?: string;
  subscribers?: number;
}
