import React, { useEffect, useState } from 'react';
import Login from './pages/Login';
import ChatRoom from './pages/ChatRoom';
import { getToken, setToken } from './Api';

export default function App() {
  const [token, setTokenLocal] = useState(getToken());
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Token present -> try to decode user name (JWT simple decode)
    const t = getToken();
    if (t) {
      try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        setUser({ id: payload.id, name: payload.name });
      } catch (e) {
        setUser(null);
      }
    }
  }, [token]);

  const onLogin = ({ token, user }) => {
    setToken(token);
    setTokenLocal(token);
    setUser(user);
  };

  const onLogout = () => {
    setToken(null);
    setTokenLocal(null);
    setUser(null);
  };

  return (
    <div className="app">
      {!getToken() ? (
        <Login onLogin={onLogin} />
      ) : (
        <ChatRoom token={getToken()} user={user} onLogout={onLogout} />
      )}
    </div>
  );
}
