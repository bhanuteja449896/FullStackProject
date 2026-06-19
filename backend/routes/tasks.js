const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// Helper to check if a user is authorized to access a task
const verifyTaskAccess = async (taskId, user) => {
  const result = await db.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (result.rows.length === 0) return null;
  const task = result.rows[0];

  if (user.role === 'admin' || user.role === 'manager') return task;
  if (task.assigned_to === user.userId || task.created_by === user.userId) return task;
  return null;
};

// ===== GET MY/ALL TASKS =====
router.get('/my', verifyToken, checkPermission('read:tasks'), async (req, res) => {
  try {
    let query;
    let params;

    // Managers/Admins can see all tasks. Regular users see only their assigned/created tasks.
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      query = `
        SELECT t.*, 
               u.full_name as assignee_name, u.email as assignee_email,
               c.full_name as creator_name, c.email as creator_email
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN users c ON t.created_by = c.id
        ORDER BY t.created_at DESC
      `;
      params = [];
    } else {
      query = `
        SELECT t.*, 
               u.full_name as assignee_name, u.email as assignee_email,
               c.full_name as creator_name, c.email as creator_email
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN users c ON t.created_by = c.id
        WHERE t.assigned_to = $1 OR t.created_by = $1
        ORDER BY t.created_at DESC
      `;
      params = [req.user.userId];
    }

    const result = await db.query(query, params);
    res.json({ tasks: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== GET SINGLE TASK =====
router.get('/:id', verifyToken, checkPermission('read:tasks'), async (req, res) => {
  try {
    const task = await verifyTaskAccess(req.params.id, req.user);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }
    res.json({ task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== CREATE TASK =====
router.post('/', verifyToken, checkPermission('create:tasks'), async (req, res) => {
  try {
    const { title, description, assignedTo, priority, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    // Insert task
    const result = await db.query(
      `INSERT INTO tasks (title, description, created_by, assigned_to, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        title,
        description || '',
        req.user.userId,
        assignedTo || null,
        priority || 'medium',
        dueDate || null
      ]
    );

    const task = result.rows[0];

    // Log action
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.userId, 'CREATE', 'tasks', task.id, req.cleanedIp, req.headers['user-agent'] || 'Unknown']
    );

    res.status(201).json({ task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== UPDATE TASK =====
router.put('/:id', verifyToken, checkPermission('update:tasks'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assignedTo, dueDate } = req.body;

    const task = await verifyTaskAccess(id, req.user);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    let updatedTask;

    if (req.user.role === 'user') {
      // Standard Users can ONLY change the status of tasks assigned to them.
      if (task.assigned_to !== req.user.userId) {
        return res.status(403).json({ error: 'You can only update the status of tasks assigned to you' });
      }

      const result = await db.query(
        `UPDATE tasks 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [status || task.status, id]
      );
      updatedTask = result.rows[0];

      // Log status changes
      await db.query(
        `INSERT INTO audit_logs (user_id, action, resource, resource_id, changes, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user.userId,
          'UPDATE_STATUS',
          'tasks',
          id,
          JSON.stringify({ status: { old: task.status, new: status } }),
          req.cleanedIp,
          req.headers['user-agent'] || 'Unknown'
        ]
      );
    } else {
      // Managers and Admins can update all fields
      const result = await db.query(
        `UPDATE tasks 
         SET title = $1, description = $2, status = $3, priority = $4, assigned_to = $5, due_date = $6, updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          title || task.title,
          description !== undefined ? description : task.description,
          status || task.status,
          priority || task.priority,
          assignedTo !== undefined ? assignedTo : task.assigned_to,
          dueDate !== undefined ? dueDate : task.due_date,
          id
        ]
      );
      updatedTask = result.rows[0];

      // Log full updates
      await db.query(
        `INSERT INTO audit_logs (user_id, action, resource, resource_id, changes, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user.userId,
          'UPDATE',
          'tasks',
          id,
          JSON.stringify({
            before: { title: task.title, description: task.description, status: task.status, priority: task.priority, assigned_to: task.assigned_to, due_date: task.due_date },
            after: { title: title || task.title, description: description, status: status, priority: priority, assigned_to: assignedTo, due_date: dueDate }
          }),
          req.cleanedIp,
          req.headers['user-agent'] || 'Unknown'
        ]
      );
    }

    res.json({ task: updatedTask });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DELETE TASK =====
router.delete('/:id', verifyToken, checkPermission('delete:tasks'), async (req, res) => {
  try {
    const { id } = req.params;

    // Managers/Admins can delete any task. Let's verify task exists first.
    const taskRes = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await db.query('DELETE FROM tasks WHERE id = $1', [id]);

    // Log action
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.userId, 'DELETE', 'tasks', id, req.cleanedIp, req.headers['user-agent'] || 'Unknown']
    );

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== GET COMMENTS =====
router.get('/:id/comments', verifyToken, checkPermission('read:tasks'), async (req, res) => {
  try {
    const { id } = req.params;
    const task = await verifyTaskAccess(id, req.user);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    const comments = await db.query(
      `SELECT tc.*, u.full_name as author_name, u.email as author_email
       FROM task_comments tc
       JOIN users u ON tc.user_id = u.id
       WHERE tc.task_id = $1
       ORDER BY tc.created_at ASC`,
      [id]
    );

    res.json({ comments: comments.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ADD COMMENT =====
router.post('/:id/comments', verifyToken, checkPermission('read:tasks'), async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({ error: 'Comment required' });
    }

    const task = await verifyTaskAccess(id, req.user);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    const result = await db.query(
      `INSERT INTO task_comments (task_id, user_id, comment)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, req.user.userId, comment]
    );

    res.status(201).json({ comment: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
