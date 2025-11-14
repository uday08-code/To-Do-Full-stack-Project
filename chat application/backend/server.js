require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// ---------- MySQL Connection ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chat_app',
  port: process.env.DB_PORT || 3307, // supports your changed port[PORT NUMBER CHANGID]
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ---------- Socket.IO Setup ----------
const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict this to your frontend URL
    methods: ['GET', 'POST'],
  },
});

// ---------- Helper Functions ----------
const createToken = (user) =>
  jwt.sign({ id: user.id, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });

const authMiddleware = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'Missing auth' });
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ---------- User Authentication ----------

// Register
app.post('/api/register', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password)
    return res.status(400).json({ message: 'Name and password required' });

  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE name = ?', [name]);
    if (rows.length) return res.status(400).json({ message: 'User already exists' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, password_hash) VALUES (?, ?)',
      [name, hash]
    );
    const user = { id: result.insertId, name };
    const token = createToken(user);
    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password)
    return res.status(400).json({ message: 'Name and password required' });

  try {
    const [rows] = await pool.query(
      'SELECT id, name, password_hash FROM users WHERE name = ?',
      [name]
    );
    if (!rows.length) return res.status(400).json({ message: 'Invalid credentials' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    const token = createToken({ id: user.id, name: user.name });
    res.json({ user: { id: user.id, name: user.name }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- Messages API ----------

// Get all messages
app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, user_id, username, content, created_at FROM messages ORDER BY created_at ASC LIMIT 1000'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new message (for testing API - real-time uses socket)
app.post('/api/messages', authMiddleware, async (req, res) => {
  const { content } = req.body;
  const userId = req.user.id;
  const username = req.user.name;
  if (!content) return res.status(400).json({ message: 'Content required' });

  try {
    const [result] = await pool.query(
      'INSERT INTO messages (user_id, username, content) VALUES (?, ?, ?)',
      [userId, username, content]
    );
    const newMsg = { id: result.insertId, user_id: userId, username, content };
    io.to('main').emit('message', newMsg);
    res.json(newMsg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving message' });
  }
});

// ---------- CRUD: Update Message ----------
app.put('/api/messages/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.user.id;

  if (!content || !content.trim()) {
    return res.status(400).json({ message: 'Content required' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Message not found' });
    if (rows[0].user_id !== userId)
      return res.status(403).json({ message: 'Not your message' });

    await pool.query('UPDATE messages SET content = ? WHERE id = ?', [content, id]);
    const updatedMessage = { ...rows[0], content };
    io.to('main').emit('messageUpdated', updatedMessage);

    res.json({ message: 'Message updated', data: updatedMessage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating message' });
  }
});

// ---------- CRUD: Delete Message ----------
app.delete('/api/messages/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Message not found' });
    if (rows[0].user_id !== userId)
      return res.status(403).json({ message: 'Not your message' });

    await pool.query('DELETE FROM messages WHERE id = ?', [id]);
    io.to('main').emit('messageDeleted', { id });

    res.json({ message: 'Message deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error deleting message' });
  }
});

// ---------- Socket.IO Events ----------
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join', async (data) => {
    try {
      const { token } = data;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;
      socket.join('main');
      console.log(`${payload.name} joined chat`);
      socket.emit('joined', { user: payload });
    } catch (e) {
      console.warn('Socket join unauthorized');
      socket.emit('error', { message: 'Unauthorized' });
    }
  });

  socket.on('message', async (data) => {
    if (!socket.user)
      return socket.emit('error', { message: 'Not authenticated' });

    const content = (data.content || '').toString().trim();
    if (!content) return;

    const username = socket.user.name;
    const userId = socket.user.id;

    try {
      await pool.query('INSERT INTO messages (user_id, username, content) VALUES (?, ?, ?)', [
        userId,
        username,
        content,
      ]);
      const payload = { username, content, created_at: new Date() };
      io.to('main').emit('message', payload);
    } catch (e) {
      console.error('Save message error:', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// ---------- Start Server ----------
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
