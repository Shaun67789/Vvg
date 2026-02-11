export interface FileNode {
  path: string;
  content: string; // Base64 encoded content
  isBinary: boolean;
  size: number;
}

export interface RepoConfig {
  name: string;
  description: string;
  isPrivate: boolean;
  includeReadme: boolean;
  readmeContent?: string;
}

export interface UserProfile {
  login: string;
  avatar_url: string;
  name: string;
}

export interface TokenVerification {
  isValid: boolean;
  scopes: string[];
  user: UserProfile | null;
  error?: string;
}

export enum Step {
  AUTH = 0,
  UPLOAD = 1,
  CONFIG = 2,
  DEPLOY = 3,
  SUCCESS = 4
}

export interface LogEntry {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  timestamp: number;
}
