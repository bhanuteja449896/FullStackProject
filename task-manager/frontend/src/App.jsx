import React, { useState, useEffect } from 'react';
import { apiFetch } from './api';

export default function App() {
  // Global States
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  
  // Navigation
  const [currentTab, setCurrentTab] = useState('tasks');
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'signup'

  // Data States
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeCommentsTaskId, setActiveCommentsTaskId] = useState(null);
  const [comments, setComments] = useState([]);

  // Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginDevice, setLoginDevice] = useState('');
  
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupDevice, setSignupDevice] = useState('');

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');

  const [commentText, setCommentText] = useState('');
  
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');

  const [editingTask, setEditingTask] = useState(null);

  // Helper to show flash messages
  const showAlert = (text, type = 'success') => {
    setAlert({ text, type });
    setTimeout(() => setAlert(null), 5000);
  };

  // Initial Auth Check
  useEffect(() => {
    async function checkAuth() {
      try {
        const data = await apiFetch('/users/profile');
        setCurrentUser(data.user);
      } catch (err) {
        console.log('No active session.');
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Listen to Global token expiration event
  useEffect(() => {
    const handleAuthExpired = () => {
      setCurrentUser(null);
      setTasks([]);
      setSessions([]);
      setAuditLogs([]);
      setUsers([]);
      showAlert('Session expired. Please log in again.', 'error');
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  // Load contextual data based on current tab
  useEffect(() => {
    if (!currentUser) return;
    
    if (currentTab === 'tasks') {
      fetchTasks();
    } else if (currentTab === 'create-task') {
      fetchUsers();
    } else if (currentTab === 'sessions') {
      fetchSessions();
    } else if (currentTab === 'admin') {
      fetchAuditLogs();
      fetchUsers();
    }
  }, [currentTab, currentUser]);

  // API Call Helpers
  const fetchTasks = async () => {
    try {
      const data = await apiFetch('/tasks/my');
      setTasks(data.tasks);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const fetchUsers = async () => {
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') return;
    try {
      const data = await apiFetch('/users');
      setUsers(data.users);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const fetchSessions = async () => {
    try {
      const data = await apiFetch('/auth/sessions');
      setSessions(data.sessions);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const fetchAuditLogs = async () => {
    if (currentUser.role !== 'admin') return;
    try {
      const data = await apiFetch('/admin/audit-logs');
      setAuditLogs(data.logs);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const fetchComments = async (taskId) => {
    try {
      const data = await apiFetch(`/tasks/${taskId}/comments`);
      setComments(data.comments);
    } catch (err) {
      showAlert('Failed to load comments', 'error');
    }
  };

  // Auth Submit Handlers
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      showAlert('Email and password required', 'error');
      return;
    }
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: {
          email: loginEmail,
          password: loginPassword,
          deviceName: loginDevice || 'Web Browser'
        }
      });
      setCurrentUser(data.user);
      showAlert('Login successful!', 'success');
      setCurrentTab('tasks');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (!signupEmail || !signupPassword) {
      showAlert('Email and password required', 'error');
      return;
    }
    try {
      const data = await apiFetch('/auth/signup', {
        method: 'POST',
        body: {
          email: signupEmail,
          password: signupPassword,
          fullName: signupName,
          deviceName: signupDevice || 'Web Browser'
        }
      });
      setCurrentUser(data.user);
      showAlert('Signup successful!', 'success');
      setCurrentTab('tasks');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const handleLogoutSubmit = async () => {
    if (!confirm('Are you sure you want to log out?')) return;
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      setCurrentUser(null);
      setTasks([]);
      setSessions([]);
      setAuditLogs([]);
      setUsers([]);
      showAlert('Logged out successfully', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  // Task Actions
  const handleCreateTaskSubmit = async (e) => {
    e.preventDefault();
    if (!taskTitle) {
      showAlert('Task title is required', 'error');
      return;
    }
    try {
      await apiFetch('/tasks', {
        method: 'POST',
        body: {
          title: taskTitle,
          description: taskDesc,
          priority: taskPriority,
          assignedTo: taskAssignee || null,
          dueDate: taskDueDate || null
        }
      });
      showAlert('Task created successfully!', 'success');
      setTaskTitle('');
      setTaskDesc('');
      setTaskPriority('medium');
      setTaskAssignee('');
      setTaskDueDate('');
      setCurrentTab('tasks');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const handleOpenEdit = (task) => {
    setEditingTask({ ...task });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`/tasks/${editingTask.id}`, {
        method: 'PUT',
        body: editingTask
      });
      showAlert('Task updated successfully!', 'success');
      setEditingTask(null);
      fetchTasks();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await apiFetch(`/tasks/${taskId}`, { method: 'DELETE' });
      showAlert('Task deleted successfully!', 'success');
      fetchTasks();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  // Comments
  const handleToggleComments = (taskId) => {
    if (activeCommentsTaskId === taskId) {
      setActiveCommentsTaskId(null);
      setComments([]);
    } else {
      setActiveCommentsTaskId(taskId);
      fetchComments(taskId);
    }
  };

  const handlePostCommentSubmit = async (e, taskId) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      await apiFetch(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: { comment: commentText }
      });
      setCommentText('');
      fetchComments(taskId);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  // Sessions
  const handleTerminateSession = async (sessionId) => {
    if (!confirm('Terminate this device session remotely?')) return;
    try {
      await apiFetch(`/auth/logout-device/${sessionId}`, { method: 'POST' });
      showAlert('Session terminated successfully!', 'success');
      fetchSessions();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  // Admin User Creation & Deletion
  const handleCreateUserSubmit = async (e) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) {
      showAlert('Email and password required', 'error');
      return;
    }
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: {
          email: newUserEmail,
          password: newUserPassword,
          fullName: newUserName,
          roleName: newUserRole
        }
      });
      showAlert('User created successfully!', 'success');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserRole('user');
      fetchUsers();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await apiFetch(`/admin/users/${userId}`, { method: 'DELETE' });
      showAlert('User deleted successfully!', 'success');
      fetchUsers();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-secondary)' }}>Loading Aether Platform...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Alert Banner */}
      {alert && (
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, width: '90%', maxWidth: '500px' }}>
          <div className={`alert alert-${alert.type}`}>
            {alert.type === 'success' ? '✓' : '✗'} {alert.text}
          </div>
        </div>
      )}

      {!currentUser ? (
        /* Auth Screen */
        <div className="container">
          <div className="auth-wrapper fade-in">
            <h1 style={{ textAlign: 'center', marginBottom: '24px', fontFamily: 'var(--font-display)', fontWeight: 800 }}>Aether Tasks</h1>
            <div className="auth-tabs">
              <div className={`auth-tab ${authTab === 'login' ? 'active' : ''}`} onClick={() => setAuthTab('login')}>Login</div>
              <div className={`auth-tab ${authTab === 'signup' ? 'active' : ''}`} onClick={() => setAuthTab('signup')}>Signup</div>
            </div>

            {authTab === 'login' ? (
              <form onSubmit={handleLoginSubmit}>
                <label htmlFor="email-login">Email Address</label>
                <input id="email-login" type="email" placeholder="email@test.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                
                <label htmlFor="pass-login">Password</label>
                <input id="pass-login" type="password" placeholder="••••••••" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
                
                <label htmlFor="dev-login">Device Name</label>
                <input id="dev-login" type="text" placeholder="e.g. Laptop, iPhone" value={loginDevice} onChange={e => setLoginDevice(e.target.value)} />
                
                <button type="submit" style={{ width: '100%', marginTop: '10px' }}>Authenticate</button>
              </form>
            ) : (
              <form onSubmit={handleSignupSubmit}>
                <label htmlFor="email-signup">Email Address</label>
                <input id="email-signup" type="email" placeholder="email@test.com" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} required />
                
                <label htmlFor="pass-signup">Password</label>
                <input id="pass-signup" type="password" placeholder="••••••••" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} required />
                
                <label htmlFor="name-signup">Full Name</label>
                <input id="name-signup" type="text" placeholder="John Doe" value={signupName} onChange={e => setSignupName(e.target.value)} />
                
                <label htmlFor="dev-signup">Device Name</label>
                <input id="dev-signup" type="text" placeholder="e.g. Laptop, Phone" value={signupDevice} onChange={e => setSignupDevice(e.target.value)} />
                
                <button type="submit" style={{ width: '100%', marginTop: '10px' }}>Create Account</button>
              </form>
            )}

            <div className="test-accounts-info">
              <strong>Demo Credentials (Password: password)</strong>
              <table>
                <tbody>
                  <tr>
                    <td><strong>Admin:</strong> admin@test.com</td>
                    <td><strong>Manager:</strong> manager@test.com</td>
                  </tr>
                  <tr>
                    <td colSpan="2"><strong>User:</strong> user@test.com</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Authenticated Dashboard */
        <div>
          <header>
            <h1>Aether Tasks</h1>
            
            <nav>
              <button className={currentTab === 'tasks' ? 'active' : ''} onClick={() => setCurrentTab('tasks')}>My Tasks</button>
              {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
                <button className={currentTab === 'create-task' ? 'active' : ''} onClick={() => setCurrentTab('create-task')}>Create Task</button>
              )}
              <button className={currentTab === 'sessions' ? 'active' : ''} onClick={() => setCurrentTab('sessions')}>Devices</button>
              {currentUser.role === 'admin' && (
                <button className={currentTab === 'admin' ? 'active' : ''} onClick={() => setCurrentTab('admin')}>Admin</button>
              )}
              <button onClick={handleLogoutSubmit} style={{ boxShadow: 'none', background: 'transparent', color: 'var(--color-danger)' }}>Logout</button>
            </nav>

            <div className="user-profile-summary">
              <span className="name">{currentUser.fullName}</span>
              <span className="role">
                <span className={`badge badge-${currentUser.role}`}>{currentUser.role}</span>
              </span>
            </div>
          </header>

          <main className="container fade-in">
            {currentTab === 'tasks' && (
              <div className="card">
                <h2>Active Board Tasks</h2>
                {tasks.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No tasks registered on this workspace.</p>
                ) : (
                  <div className="task-grid">
                    {tasks.map(task => (
                      <div className="task-card" key={task.id}>
                        <div>
                          <div className="task-header">
                            <h3>{task.title}</h3>
                            <span className={`badge badge-${task.status}`}>{task.status}</span>
                          </div>
                          <p className="task-description">{task.description || 'No description provided.'}</p>
                        </div>
                        
                        <div>
                          <div className="task-meta">
                            <span>Prio: <strong className={`prio-${task.priority}`}>{task.priority}</strong></span>
                            <span>Due: {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'None'}</span>
                          </div>
                          <div className="task-meta" style={{ borderTop: 'none', paddingTop: 0, marginTop: '4px' }}>
                            <span>By: {task.creator_name || task.created_by}</span>
                            <span>To: {task.assignee_name || 'Unassigned'}</span>
                          </div>

                          <div className="task-actions">
                            <button className="btn-secondary" onClick={() => handleOpenEdit(task)}>Edit</button>
                            <button className="btn-secondary" onClick={() => handleToggleComments(task.id)}>
                              Comments {activeCommentsTaskId === task.id ? '▲' : '▼'}
                            </button>
                            {(currentUser.role === 'admin' || currentUser.role === 'manager' || task.created_by === currentUser.id) && (
                              <button className="btn-danger" onClick={() => handleDeleteTask(task.id)}>Delete</button>
                            )}
                          </div>

                          {/* Comments section */}
                          {activeCommentsTaskId === task.id && (
                            <div className="comments-drawer fade-in">
                              <div className="comment-list">
                                {comments.length === 0 ? (
                                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No comments posted.</p>
                                ) : (
                                  comments.map(c => (
                                    <div className="comment-item" key={c.id}>
                                      <div>
                                        <span className="author">{c.author_name}</span>
                                        <span className="time">{new Date(c.created_at).toLocaleString()}</span>
                                      </div>
                                      <div className="text">{c.comment}</div>
                                    </div>
                                  ))
                                )}
                              </div>
                              <form onSubmit={(e) => handlePostCommentSubmit(e, task.id)} style={{ display: 'flex', gap: '8px' }}>
                                <input 
                                  type="text" 
                                  placeholder="Post comment..." 
                                  value={commentText} 
                                  onChange={e => setCommentText(e.target.value)} 
                                  style={{ marginBottom: 0, padding: '8px' }}
                                />
                                <button type="submit" style={{ padding: '8px 16px' }}>Send</button>
                              </form>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentTab === 'create-task' && (
              <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h2>Create New Workspace Task</h2>
                <form onSubmit={handleCreateTaskSubmit}>
                  <label htmlFor="create-title">Task Title</label>
                  <input id="create-title" type="text" placeholder="Database Migration, CSS styling, etc." value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required />
                  
                  <label htmlFor="create-desc">Description</label>
                  <textarea id="create-desc" placeholder="Details of the job..." rows="4" value={taskDesc} onChange={e => setTaskDesc(e.target.value)}></textarea>
                  
                  <label htmlFor="create-prio">Task Priority</label>
                  <select id="create-prio" value={taskPriority} onChange={e => setTaskPriority(e.target.value)}>
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                  
                  <label htmlFor="create-assign">Assign Team Member</label>
                  <select id="create-assign" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)}>
                    <option value="">-- Select Member --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                    ))}
                  </select>

                  <label htmlFor="create-due">Due Date</label>
                  <input id="create-due" type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} />

                  <button type="submit" style={{ width: '100%', marginTop: '10px' }}>Create Task</button>
                </form>
              </div>
            )}

            {currentTab === 'sessions' && (
              <div className="card">
                <h2>Registered Session Devices</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>You are logged in on the following devices. You can revoke any session remotely.</p>
                
                <div className="session-grid">
                  {sessions.map(s => (
                    <div className="session-card" key={s.id}>
                      <div className="session-info">
                        <strong>{s.deviceName}</strong>
                        <span>IP: {s.ipAddress}</span>
                        <span>Logged in: {new Date(s.createdAt).toLocaleString()}</span>
                        <span>Last active: {new Date(s.lastActivity).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="session-status">Active</span>
                        <button className="btn-danger" onClick={() => handleTerminateSession(s.id)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Terminate</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentTab === 'admin' && (
              <div>
                <div className="card" style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 45%' }}>
                    <h2>Create Team Account</h2>
                    <form onSubmit={handleCreateUserSubmit}>
                      <label htmlFor="admin-email">Email Address</label>
                      <input id="admin-email" type="email" placeholder="name@company.com" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} required />
                      
                      <label htmlFor="admin-pass">Temp Password</label>
                      <input id="admin-pass" type="password" placeholder="••••••••" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} required />
                      
                      <label htmlFor="admin-name">Full Name</label>
                      <input id="admin-name" type="text" placeholder="Sarah Connor" value={newUserName} onChange={e => setNewUserName(e.target.value)} />
                      
                      <label htmlFor="admin-role">System Role</label>
                      <select id="admin-role" value={newUserRole} onChange={e => setNewUserRole(e.target.value)}>
                        <option value="user">User (Basic privileges)</option>
                        <option value="manager">Manager (Can assign tasks)</option>
                        <option value="admin">Administrator (Full control)</option>
                      </select>

                      <button type="submit" style={{ width: '100%', marginTop: '10px' }}>Register Member</button>
                    </form>
                  </div>

                  <div style={{ flex: '1 1 45%', minWidth: '350px' }}>
                    <h2>Team Directories</h2>
                    <div className="table-wrapper">
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map(u => (
                            <tr key={u.id}>
                              <td>{u.full_name}</td>
                              <td>{u.email}</td>
                              <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                              <td>
                                {u.id !== currentUser.id ? (
                                  <button className="btn-danger" onClick={() => handleDeleteUser(u.id)} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Delete</button>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Current User</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <h2>Security Audits Log</h2>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Identity</th>
                          <th>Resource</th>
                          <th>IP Address</th>
                          <th>Timestamp</th>
                          <th>Anomaly/Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map(log => (
                          <tr key={log.id}>
                            <td>
                              <span className={`badge ${log.action.includes('DENIED') || log.action.includes('SUSPICIOUS') ? 'badge-admin' : 'badge-user'}`}>
                                {log.action}
                              </span>
                            </td>
                            <td>{log.user_email || 'System'}</td>
                            <td>{log.resource}</td>
                            <td>{log.ip_address}</td>
                            <td>{new Date(log.created_at).toLocaleString()}</td>
                            <td>
                              {log.changes ? (
                                <pre style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                                  {JSON.stringify(log.changes, null, 2)}
                                </pre>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* Edit Task Modal */}
          {editingTask && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
              <div className="card fade-in" style={{ width: '90%', maxWidth: '550px', backgroundColor: 'var(--panel-bg-solid)', border: '1px solid var(--panel-border-hover)' }}>
                <h2>Edit Workspace Task</h2>
                <form onSubmit={handleSaveEdit}>
                  {currentUser.role === 'user' ? (
                    // Regular user can ONLY edit status
                    <div>
                      <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        As a regular user, you are only allowed to update the status of this task.
                      </p>
                      <label htmlFor="edit-status-usr">Task Status</label>
                      <select id="edit-status-usr" value={editingTask.status} onChange={e => setEditingTask({ ...editingTask, status: e.target.value })}>
                        <option value="pending">Pending</option>
                        <option value="in-progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  ) : (
                    // Manager / Admin can edit everything
                    <div>
                      <label htmlFor="edit-title-adm">Task Title</label>
                      <input id="edit-title-adm" type="text" value={editingTask.title} onChange={e => setEditingTask({ ...editingTask, title: e.target.value })} required />

                      <label htmlFor="edit-desc-adm">Description</label>
                      <textarea id="edit-desc-adm" rows="4" value={editingTask.description || ''} onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}></textarea>

                      <label htmlFor="edit-status-adm">Task Status</label>
                      <select id="edit-status-adm" value={editingTask.status} onChange={e => setEditingTask({ ...editingTask, status: e.target.value })}>
                        <option value="pending">Pending</option>
                        <option value="in-progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>

                      <label htmlFor="edit-prio-adm">Task Priority</label>
                      <select id="edit-prio-adm" value={editingTask.priority} onChange={e => setEditingTask({ ...editingTask, priority: e.target.value })}>
                        <option value="low">Low Priority</option>
                        <option value="medium">Medium Priority</option>
                        <option value="high">High Priority</option>
                      </select>

                      <label htmlFor="edit-assign-adm">Assign Team Member</label>
                      <select id="edit-assign-adm" value={editingTask.assigned_to || ''} onChange={e => setEditingTask({ ...editingTask, assigned_to: e.target.value || null })}>
                        <option value="">-- Unassigned --</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                        ))}
                      </select>

                      <label htmlFor="edit-due-adm">Due Date</label>
                      <input id="edit-due-adm" type="date" value={editingTask.due_date ? editingTask.due_date.substring(0, 10) : ''} onChange={e => setEditingTask({ ...editingTask, due_date: e.target.value || null })} />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button type="submit" style={{ flex: 1 }}>Save Changes</button>
                    <button type="button" className="btn-secondary" onClick={() => setEditingTask(null)} style={{ flex: 1 }}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
