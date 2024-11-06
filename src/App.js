import React, { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import OrderDistributionTable from './components/OrderDistributionTable';
import { googleSheetsService } from './services/googleSheetsService';

function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [orders, setOrders] = useState([]);
  const [hasEditAccess, setHasEditAccess] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        setIsLoading(true);
        setError(null);
        console.log('Initializing app...');
        await googleSheetsService.init();
        console.log('Google API initialized successfully');
        if (googleSheetsService.isSignedIn()) {
          console.log('User is already signed in');
          await handleSignInSuccess();
        }
      } catch (error) {
        console.error('Error initializing app:', error);
        setError(`Ошибка инициализации приложения: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  const handleSignInSuccess = async () => {
    try {
      console.log('Handling sign in success...');
      const email = await googleSheetsService.signIn();
      setUserEmail(email);
      setIsSignedIn(true);
      const orders = await googleSheetsService.loadOrders();
      setOrders(orders);
      const editAccess = await googleSheetsService.checkEditAccess();
      setHasEditAccess(editAccess);
    } catch (error) {
      console.error('Error during sign in:', error);
      setError(`Ошибка при входе в систему: ${error.message}`);
      setIsSignedIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await googleSheetsService.signOut();
      setIsSignedIn(false);
      setUserEmail('');
      setOrders([]);
      setHasEditAccess(false);
    } catch (error) {
      console.error('Error during sign out:', error);
      setError(`Ошибка при выходе из системы: ${error.message}`);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Загрузка...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="text-red-500 p-4 mb-4">{error}</div>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <div className="App">
      {!isSignedIn ? (
        <LoginPage onSignIn={handleSignInSuccess} />
      ) : (
        <>
          <header className="bg-gray-800 text-white p-4">
            <div className="container mx-auto flex justify-between items-center">
              <h1 className="text-2xl font-bold">Планирование производства</h1>
              <div>
                <span className="mr-4">{userEmail}</span>
                <button
                  onClick={handleSignOut}
                  className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                >
                  Выйти
                </button>
              </div>
            </div>
          </header>
          <main className="container mx-auto mt-8">
            <OrderDistributionTable
              orders={orders}
              setOrders={setOrders}
              hasEditAccess={hasEditAccess}
              googleSheetsService={googleSheetsService}
              setError={setError}
            />
          </main>
        </>
      )}
    </div>
  );
}

export default App;