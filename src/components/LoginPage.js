import React, { useEffect, useState, useCallback } from 'react';
import { googleSheetsService } from '../services/googleSheetsService';
import { GOOGLE_SHEETS_CONFIG } from '../config/googleSheets';

const LoginPage = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isGsiInitialized, setIsGsiInitialized] = useState(false);

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
    } finally {
      setIsLoading(false);
    }
  }, [onLogin, setIsLoading, setError]);

  // New GSI Callback Handler
  const handleGsiCallbackFunction = useCallback(async (credentialResponse) => {
    console.log('GSI Callback invoked. CredentialResponse:', credentialResponse);
    setIsLoading(true);
    setError(null);
    try {
      const idTokenPayload = await googleSheetsService.processIdTokenResponse(credentialResponse);
      if (idTokenPayload) {
        console.log('ID Token processed successfully, proceeding to auth success.');
        await handleAuthSuccess();
      } else {
        throw new Error('Failed to process ID token or extract payload.');
      }
    } catch (err) {
      console.error('GSI Callback - Error processing token or auth success:', err);
      setError('Ошибка обработки данных входа: ' + (err.message || 'Неизвестная ошибка'));
      // Ensure user info is cleared if GSI callback fails significantly
      localStorage.removeItem('gauth_id_token_payload');
      localStorage.removeItem('gauth_token'); 
      googleSheetsService.idTokenPayload = null; // Clear in-memory cache
      googleSheetsService.accessToken = null; // Clear in-memory cache
    } finally {
      setIsLoading(false);
    }
  }, [handleAuthSuccess, setIsLoading, setError]);

  // Effect for primary initialization (Google Sheet Service, GSI client)
  useEffect(() => {
    const initializeGoogleAuthAndGsi = async () => {
      setIsLoading(true);
      setError(null);
      setIsGsiInitialized(false);
      try {
        await googleSheetsService.initialize();

        if (googleSheetsService.isAuthenticated()) {
          console.log('User is already authenticated, proceeding to auth success.');
          await handleAuthSuccess();
          return;
        }
        
        // If not authenticated, initialize GSI for sign-in button
        if (window.google?.accounts?.id) {
          console.log('Initializing Google Accounts ID for sign-in.');
          window.google.accounts.id.initialize({
            client_id: GOOGLE_SHEETS_CONFIG.CLIENT_ID,
            callback: handleGsiCallbackFunction,
          });
          setIsGsiInitialized(true);
        } else {
          console.error('Google Identity Services (GSI) client not available for LoginPage.');
          setError('Не удалось загрузить компоненты входа Google.');
        }
      } catch (err) {
        console.error('Page Auth initialization error:', err);
        setError('Ошибка инициализации страницы входа: ' + (err.message || 'Неизвестная ошибка'));
      } finally {
        if (!googleSheetsService.isAuthenticated()) {
             setIsLoading(false);
        }
      }
    };

    initializeGoogleAuthAndGsi();
  }, [handleAuthSuccess, handleGsiCallbackFunction]);

  // Effect for rendering the GSI button once everything is ready
  useEffect(() => {
    if (!isLoading && isGsiInitialized && window.google?.accounts?.id) {
      const signInButtonContainer = document.getElementById('googleSignInButtonContainer');
      if (signInButtonContainer) {
        if (signInButtonContainer.innerHTML.trim() === '') {
          console.log('Rendering Google Sign-In button as container is ready and empty.');
          window.google.accounts.id.renderButton(
            signInButtonContainer,
            { theme: "outline", size: "large", type: "standard", text: "signin_with" } 
          );
        } else {
          console.log('Google Sign-In button container already has content.');
        }
      } else {
        console.warn('Google Sign-In button container not found when attempting to render (isLoading:false, isGsiInitialized:true).');
      }
    }
  }, [isLoading, isGsiInitialized]);

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
        
        <div id="googleSignInButtonContainer" className="flex justify-center"></div>

      </div>
    </div>
  );
};

export default LoginPage;