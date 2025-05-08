import React, { useEffect, useState, useCallback } from 'react';
import { googleSheetsService } from '../services/googleSheetsService';
import { GOOGLE_SHEETS_CONFIG } from '../config/googleSheets';

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

  useEffect(() => {
    const initializeGoogleAuthAndGsi = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize Google Sheets service (which loads GAPI and GSI client, and initializes TokenClient)
        await googleSheetsService.initialize();

        // Check if already authenticated from a previous session
        if (googleSheetsService.isAuthenticated()) {
          console.log('User is already authenticated, proceeding to auth success.');
          await handleAuthSuccess();
          // If already authenticated and handleAuthSuccess completes, no need to render login button.
          // The parent component should navigate away.
          // We might set isLoading to false here if not already handled by handleAuthSuccess or parent navigation.
          setIsLoading(false); 
          return; // Skip GSI button rendering if already logged in and validated
        }
        
        // If not authenticated, initialize GSI for sign-in
        if (window.google && window.google.accounts && window.google.accounts.id) {
          console.log('Initializing Google Accounts ID for sign-in button...');
          window.google.accounts.id.initialize({
            client_id: GOOGLE_SHEETS_CONFIG.CLIENT_ID,
            callback: handleGsiCallbackFunction,
            // auto_select: true, // Consider for automatic sign-in if one Google session exists
            // ux_mode: 'popup', // Alternative to redirect
          });
          
          const signInButtonContainer = document.getElementById('googleSignInButtonContainer');
          if (signInButtonContainer) {
            window.google.accounts.id.renderButton(
              signInButtonContainer,
              { theme: "outline", size: "large", type: "standard", text: "signin_with" } 
            );
             console.log('Google Sign-In button rendered.');
          } else {
            console.warn('Google Sign-In button container not found at the time of rendering.');
            // This might happen if the component re-renders and the div isn't there yet.
            // A small timeout or ensuring div exists might be needed in complex scenarios.
          }
          // Optionally, display One Tap
          // window.google.accounts.id.prompt((notification) => {
          //   console.log('Google One Tap prompt notification:', notification);
          //   if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          //     // Handle cases where One Tap is not shown (e.g., due to browser settings, user choice)
          //     console.warn('One Tap UI not displayed or skipped.');
          //   }
          // });
        } else {
          console.error('Google Identity Services (GSI) client not available.');
          setError('Не удалось загрузить компоненты входа Google.');
        }

      } catch (err) {
        console.error('Page Auth initialization error:', err);
        setError('Ошибка инициализации страницы входа: ' + (err.message || 'Неизвестная ошибка'));
      } finally {
        // Set loading to false only if not already handled by an early exit (like already authenticated path)
        // This ensures the login button (or loading state) is shown correctly if GSI init is pending
        if (!googleSheetsService.isAuthenticated()) {
            setIsLoading(false); 
        }
      }
    };

    // Ensure GSI script is loaded before attempting to use window.google.accounts.id
    // googleSheetsService.initialize() already handles loading gsi client.
    // We call initializeGoogleAuthAndGsi directly.
    initializeGoogleAuthAndGsi();

  }, [handleAuthSuccess, handleGsiCallbackFunction]); // Added handleGsiCallbackFunction to dependencies

  if (isLoading && !document.getElementById('googleSignInButtonContainer')) {
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