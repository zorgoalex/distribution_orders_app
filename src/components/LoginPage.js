import React, { useState } from 'react';

const LoginPage = ({ onSignIn }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onSignIn();
    } catch (error) {
      console.error('Login error:', error);
      setError('Ошибка входа. Пожалуйста, попробуйте еще раз.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-xl">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            Планирование производства
          </h2>
          <p className="mt-2 text-gray-600">
            Войдите для доступа к системе
          </p>
          {error && (
            <p className="mt-2 text-red-600">
              {error}
            </p>
          )}
        </div>
        
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <img 
            src="/google-logo.svg"
            alt="Google logo"
            className="w-6 h-6"
          />
          {isLoading ? 'Выполняется вход...' : 'Войти через Google'}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;