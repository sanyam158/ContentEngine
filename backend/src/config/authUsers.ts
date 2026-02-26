export interface ConfiguredAuthUser {
  id: string;
  username: string;
  password: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
}

/**
 * Code-configured users.
 * Add new users here (no signup flow is exposed in the app).
 */
export const AUTH_USERS: ConfiguredAuthUser[] = [
  {
    id: 'admin-user',
    username: 'admin',
    password: 'adminSanyam',
    displayName: 'Content Admin',
    role: 'admin',
  },
  {
    id: 'editor-user',
    username: 'editor',
    password: 'editorSanyam',
    displayName: 'Content Editor',
    role: 'editor',
  },
];
