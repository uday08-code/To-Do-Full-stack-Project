import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import api, { getToken, setToken } from '../Api';

export default function ChatRoom({ token, user, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const socketRef = useRef(null);
  const messagesRef = useRef();

  // ---------------- Load Message History ----------------
  useEffect(() => {
    async function load() {
      try {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        const res = await api.get('/api/messages');
        setMessages(res.data);
      } catch (e) {
        console.error('load messages', e);
      }
    }
    load();
  }, [token]);

  // ---------------- Socket Connection ----------------
  useEffect(() => {
    const socket = io('http://localhost:5000', { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join', { token });
    });

    socket.on('joined', (data) => {
      console.log('joined', data);
    });

    socket.on('message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('messageUpdated', (updatedMsg) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
      );
    });

    socket.on('messageDeleted', ({ id }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });

    socket.on('error', (err) => {
      console.warn('socket error', err);
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  // ---------------- Auto Scroll ----------------
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  // ---------------- CRUD FUNCTIONS ----------------

  // Create message
  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api.post(
        '/api/messages',
        { content: text },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setText('');
    } catch (err) {
      console.error('Send message failed:', err);
    }
  }

  // Update message
  async function updateMessage(id) {
    if (!editText.trim()) return;
    try {
      await api.put(
        `/api/messages/${id}`,
        { content: editText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEditingId(null);
      setEditText('');
    } catch (err) {
      console.error('Update message failed:', err);
    }
  }

  // Delete message
  async function deleteMessage(id) {
    try {
      await api.delete(`/api/messages/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Delete message failed:', err);
    }
  }

  function doLogout() {
    setToken(null);
    onLogout();
  }

  // ---------------- UI ----------------
  return (
    <div className="chat-container">
      <div className="chat-header">
        <div>Logged in as: <strong>{user?.name || 'Unknown'}</strong></div>
        <button onClick={doLogout}>Logout</button>
      </div>

      <div className="messages" ref={messagesRef}>
        {messages.map((m) => (
          <div
            key={m.id}
            className={`message ${
              m.username === user?.name ? 'my-message' : 'other-message'
            }`}
          >
            <div className="message-header">
              <strong>{m.username}</strong>
              <small className="timestamp">
                {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
              </small>
            </div>

            {editingId === m.id ? (
              <div className="edit-section">
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder="Edit your message..."
                />
                <button onClick={() => updateMessage(m.id)}> Save</button>
                <button onClick={() => setEditingId(null)}> Cancel</button>
              </div>
            ) : (
              <p>{m.content}</p>
            )}

            {m.username === user?.name && editingId !== m.id && (
              <div className="actions">
                <button onClick={() => { setEditingId(m.id); setEditText(m.content); }}>Edit</button>
                <button onClick={() => deleteMessage(m.id)}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form className="composer" onSubmit={sendMessage}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>

      <style jsx="true">{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100%;
          background: #f8f9fa;
        }
        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: #007bff;
          color: white;
          font-weight: bold;
        }
        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
        }
        .message {
          background: white;
          border-radius: 10px;
          padding: 10px;
          margin-bottom: 10px;
          max-width: 70%;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .my-message {
          background: #dcf8c6;
          margin-left: auto;
        }
        .other-message {
          background: #ffffff;
          margin-right: auto;
        }
        .message-header {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #555;
        }
        .actions {
          margin-top: 5px;
        }
        .actions button {
          margin-right: 5px;
          font-size: 12px;
          cursor: pointer;
        }
        .composer {
          display: flex;
          padding: 10px;
          border-top: 1px solid #ccc;
        }
        .composer input {
          flex: 1;
          padding: 8px;
          border-radius: 5px;
          border: 1px solid #ccc;
        }
        .composer button {
          margin-left: 10px;
          padding: 8px 16px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 5px;
        }
      `}</style>
    </div>
  );
}
