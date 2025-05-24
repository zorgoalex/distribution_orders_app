import React, { useEffect, useState } from 'react';
import { useAuth0 } from '../services/auth0Service';
import { googleSheetsService } from '../services/googleSheetsService';

const LoginPage = () => {
  const { loginWithRedirect, isAuthenticated, isLoading: auth0Loading, error: auth0Error, user } = useAuth0();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkAccess = async () => {
      if (isAuthenticated && user) {
        try {
          setIsLoading(true);
          setError(null);
          
          // Initialize Google Sheets service if needed
          await googleSheetsService.initialize();
          
          // Check access to spreadsheet - пока только проверяем, но не делаем redirect
          // Auth0 сам управляет состоянием аутентификации
          const hasAccess = await googleSheetsService.checkEditAccess();
          if (!hasAccess) {
            setError('У вас нет доступа к таблице. Обратитесь к администратору.');
          }
        } catch (err) {
          console.error('Access check error:', err);
          setError('Ошибка проверки доступа: ' + (err.message || 'Неизвестная ошибка'));
        } finally {
          setIsLoading(false);
        }
      }
    };

    checkAccess();
  }, [isAuthenticated, user]);

  const handleLogin = () => {
    setError(null);
    loginWithRedirect();
  };

  if (auth0Loading || isLoading) {
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
          {(error || auth0Error) && (
            <p className="mt-2 text-red-600">
              {error || auth0Error?.message || 'Ошибка аутентификации'}
            </p>
          )}
        </div>
        
        <button
          onClick={handleLogin}
          disabled={auth0Loading || isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg 
            className="w-6 h-6" 
            viewBox="0 0 24 24" 
            fill="currentColor"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          {auth0Loading || isLoading ? 'Выполняется вход...' : 'Войти через Auth0'}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;