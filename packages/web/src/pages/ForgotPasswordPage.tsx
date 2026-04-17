import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(
        axiosError.response?.data?.message ??
          'Something went wrong. Please try again in a moment.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-brand-700">Percepta</h1>
          <p className="mt-2 text-gray-600">See your real Takealot profit</p>
        </div>

        <div className="card">
          <h2 className="mb-2 text-xl font-semibold">Reset your password</h2>
          <p className="mb-6 text-sm text-gray-600">
            Enter the email you signed up with and we'll send you a link to choose a new password.
          </p>

          {submitted ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
                If an account exists for <strong>{email}</strong>, a password reset link is on its way.
                Check your inbox (and spam folder) — the link is valid for 1 hour.
              </div>
              <Link
                to="/login"
                className="block w-full rounded-lg bg-brand-600 py-2.5 text-center text-sm font-medium text-white hover:bg-brand-700"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="you@business.co.za"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {loading ? 'Sending link...' : 'Send reset link'}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-gray-600">
                Remembered it?{' '}
                <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
