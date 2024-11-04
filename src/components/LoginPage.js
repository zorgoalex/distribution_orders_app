import React, { useEffect, useState, useCallback } from 'react';
import { googleSheetsService } from '../services/googleSheetsService';

const LoginPage = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleAuthSuccess = useCallback(async () => {
    try {
      // Check access to spreadsheet
      const hasAccess = await googleSheetsService.checkEditAccess();
      if (hasAccess) {
        onLogin();
      } else {
        setError('У вас нет доступа к таблице. Обратитесь к администратору.');
      }
    } catch (err) {
      console.error('Access check error:', err);
      setError('Ошибка проверки доступа: ' + (err.message || 'Неизвестная ошибка'));
    }
  }, [onLogin]);

  useEffect(() => {
    const initializeGoogleAuth = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize Google Sheets API and auth
        await googleSheetsService.initialize();

        // Check if already authenticated
        if (googleSheetsService.isAuthenticated()) {
          await handleAuthSuccess();
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setError('Ошибка инициализации Google Auth: ' + (err.message || 'Неизвестная ошибка'));
      } finally {
        setIsLoading(false);
      }
    };

    initializeGoogleAuth();
  }, [handleAuthSuccess]);

  const handleGoogleLogin = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await googleSheetsService.signIn();
      await handleAuthSuccess();
    } catch (err) {
      console.error('Login error:', err);
      setError('Ошибка входа: ' + (err.message || 'Неизвестная ошибка'));
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
            src="/api/placeholder/24/24"
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