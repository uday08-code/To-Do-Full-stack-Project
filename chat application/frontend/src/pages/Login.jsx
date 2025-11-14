import React, { useState } from 'react';
import api, { setToken } from '../Api';

export default function Login({ onLogin }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // or 'register'
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const route = mode === 'login' ? '/api/login' : '/api/register';
      const res = await api.post(route, { name, password });
      const { token, user } = res.data;
      setToken(token);
      onLogin({ token, user });
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || 'Network error');
    }
  }

  return (
    <div className="login-container">
      <h2>Chat App</h2>
      <form onSubmit={submit} className="login-form">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" required />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" required />
        <div style={{marginTop:8}}>
          <button type="submit">{mode === 'login' ? 'Login' : 'Register'}</button>
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} style={{marginLeft:8}}>
            {mode === 'login' ? 'Switch to Register' : 'Switch to Login'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
