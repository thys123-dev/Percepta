/**
 * useSocket hook
 *
 * Manages a single shared Socket.io connection for the entire app.
 * Authenticates with the server JWT token.
 * Provides connection state and the raw socket instance.
 *
 * Usage:
 *   const { socket, connected } = useSocket();
 */

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// Singleton socket — shared across all components
let globalSocket: Socket | null = null;

/**
 * Returns the app-wide Socket.io connection.
 * Connects on first mount with the stored JWT token.
 * Disconnects when no components are using it (ref-counted).
 */
export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const token = localStorage.getItem('auth_token');

    if (!token) {
      setError('No auth token');
      return;
    }

    // Create socket if it doesn't exist yet
    if (!globalSocket) {
      globalSocket = io(API_BASE_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10_000,
      });
    }

    const socket = globalSocket;

    // Attach listeners
    const onConnect = () => {
      if (mountedRef.current) {
        setConnected(true);
        setError(null);
      }
    };

    const onDisconnect = () => {
      if (mountedRef.current) setConnected(false);
    };

    const onConnectError = (err: Error) => {
      if (mountedRef.current) {
        setError(err.message);
        setConnected(false);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    // Reflect current state
    if (socket.connected && mountedRef.current) setConnected(true);

    return () => {
      mountedRef.current = false;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      // Don't disconnect globalSocket here — it's shared across components
    };
  }, []);

  return {
    socket: globalSocket,
    connected,
    error,
  };
}

/**
 * Explicitly disconnect the global socket.
 * Call this on logout.
 */
export function disconnectSocket() {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
  }
}
