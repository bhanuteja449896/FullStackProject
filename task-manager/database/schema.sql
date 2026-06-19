-- Drop existing (for development)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS task_comments CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Enable UUID extension (just in case)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== ROLES TABLE =====
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== PERMISSIONS TABLE =====
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== ROLE_PERMISSIONS (Many-to-Many) =====
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE NOT NULL,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);

-- ===== USERS TABLE =====
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role_id UUID REFERENCES roles(id),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== USER_SESSIONS TABLE =====
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  device_name VARCHAR(255),
  device_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  access_token_hash VARCHAR(255),
  refresh_token_hash VARCHAR(255),
  last_activity TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== TASKS TABLE =====
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending',  -- pending, in-progress, completed
  priority VARCHAR(50) DEFAULT 'medium',  -- low, medium, high
  due_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== TASK_COMMENTS TABLE =====
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== AUDIT_LOGS TABLE =====
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,  -- LOGIN, LOGOUT, CREATE, UPDATE, DELETE, etc
  resource VARCHAR(100),  -- users, tasks, admin, etc
  resource_id UUID,
  changes JSONB,  -- Before/after changes
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== INDEXES =====
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ===== INSERT ROLES =====
INSERT INTO roles (name, description) VALUES
('admin', 'Administrator - Full Access'),
('manager', 'Manager - Can manage team tasks'),
('user', 'Regular User - Can view assigned tasks');

-- ===== INSERT PERMISSIONS =====
INSERT INTO permissions (name, description) VALUES
-- User permissions
('read:tasks', 'Can read tasks'),
('create:tasks', 'Can create tasks'),
('update:tasks', 'Can update tasks'),
('delete:tasks', 'Can delete tasks'),

-- Team permissions
('read:users', 'Can read users'),
('create:users', 'Can create users'),
('update:users', 'Can update users'),
('delete:users', 'Can delete users'),

-- Admin permissions
('read:admin', 'Can access admin panel'),
('manage:permissions', 'Can manage permissions'),
('view:audit', 'Can view audit logs');

-- ===== ASSIGN PERMISSIONS TO ROLES =====
-- Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'admin';

-- Manager gets specific permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'manager' AND p.name IN (
  'read:tasks', 'create:tasks', 'update:tasks',
  'read:users'
);

-- User gets basic permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user' AND p.name IN (
  'read:tasks', 'update:tasks'
);

-- ===== CREATE TEST DATA =====
-- Password hash is $2a$10$sACOFZO../pMmGKA9DWBBujQRM0IU8EJwN9/et2vqC2DToH5VinLK for 'password'
INSERT INTO users (email, password_hash, full_name, role_id, is_active)
VALUES
  ('admin@test.com', '$2a$10$sACOFZO../pMmGKA9DWBBujQRM0IU8EJwN9/et2vqC2DToH5VinLK', 'Admin User', (SELECT id FROM roles WHERE name = 'admin'), true),
  ('manager@test.com', '$2a$10$sACOFZO../pMmGKA9DWBBujQRM0IU8EJwN9/et2vqC2DToH5VinLK', 'Manager User', (SELECT id FROM roles WHERE name = 'manager'), true),
  ('user@test.com', '$2a$10$sACOFZO../pMmGKA9DWBBujQRM0IU8EJwN9/et2vqC2DToH5VinLK', 'Regular User', (SELECT id FROM roles WHERE name = 'user'), true);
