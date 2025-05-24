import React, { useState, useEffect } from 'react';
import { addDays, subDays, isSunday, max } from 'date-fns';
import LoginPage from './components/LoginPage';
import OrderDistributionTable from './components/OrderDistributionTable';
import { auth0GoogleSheetsService } from './services/auth0GoogleSheetsService';
import { useAuth0 } from './services/auth0Service';
import './App.css';

export default function App() {
  const { isAuthenticated, isLoading, getAccessTokenSilently, user } = useAuth0();
  const [orders, setOrders] = useState([]);
  const [days, setDays] = useState([]);
  const [ordersMap, setOrdersMap] = useState({});
  const [error, setError] = useState(null);
  const [hasEditAccess, setHasEditAccess] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      initializeGoogleSheets();
    }
  }, [isAuthenticated, user]);

  const initializeGoogleSheets = async () => {
    try {
      setIsInitializing(true);
      setError(null);

      // Получаем Google access_token из Auth0
      const accessToken = await getAccessTokenSilently({
        authorizationParams: {
          scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly"
        }
      });

      // Инициализируем Google Sheets сервис с токеном
      await auth0GoogleSheetsService.initialize(accessToken);
      
      loadOrders();
      checkEditAccess();
      
      let unsubscribe;
      const startWatching = async () => {
        unsubscribe = await auth0GoogleSheetsService.watchForChanges((updatedOrders) => {
          console.log('Changes detected, updating orders');
          setOrders(updatedOrders);
        });
      };
      
      startWatching();
      
      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    } catch (error) {
      console.error('Error initializing Google Sheets:', error);
      setError('Ошибка при инициализации Google Sheets: ' + error.message);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    if (orders.length > 0) {
      initializeDays();
      updateOrdersMap();
    }
  }, [orders]);

  const initializeDays = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startDate = subDays(today, 5);
    
    const maxPlannedDate = orders.reduce((maxDate, order) => {
      if (!order.plannedDate) return maxDate;
      
      const [day, month, year] = order.plannedDate.split('.');
      const plannedDate = new Date(year, month - 1, day);
      plannedDate.setHours(0, 0, 0, 0);
      
      return plannedDate > maxDate ? plannedDate : maxDate;
    }, today);
    
    let endDate = addDays(maxPlannedDate, 1);
    while (isSunday(endDate)) {
      endDate = addDays(endDate, 1);
    }
    
    const newDays = [];
    let currentDate = startDate;
    
    while (currentDate <= endDate) {
      if (!isSunday(currentDate)) {
        newDays.push(new Date(currentDate));
      }
      currentDate = addDays(currentDate, 1);
    }
    
    setDays(newDays);
  };

  const updateOrdersMap = () => {
    const groupedOrders = orders.reduce((acc, order) => {
      const date = order.plannedDate;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(order);
      return acc;
    }, {});
    setOrdersMap(groupedOrders);
  };

  const loadOrders = async () => {
    try {
      const loadedOrders = await auth0GoogleSheetsService.loadOrders();
      setOrders(loadedOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
      setError('Ошибка при загрузке заказов');
    }
  };

  const checkEditAccess = async () => {
    try {
      const hasAccess = await auth0GoogleSheetsService.checkEditAccess();
      setHasEditAccess(hasAccess);
    } catch (error) {
      console.error('Error checking edit access:', error);
      setError('Ошибка при проверке прав доступа');
    }
  };

  const handleOrderMove = async (order, sourceDate, targetDate) => {
    try {
      const updatedOrders = await auth0GoogleSheetsService.handleOrderMove(order, sourceDate, targetDate);
      setOrders(updatedOrders);
    } catch (error) {
      setError(error.message);
    }
  };

  const handleCheckboxChange = async (order, isChecked) => {
    try {
      const issueDate = isChecked ? order.plannedDate : null;
      const updatedOrders = await auth0GoogleSheetsService.handleCheckboxChange(order, isChecked, issueDate);
      setOrders(updatedOrders);
    } catch (error) {
      setError(error.message);
    }
  };

  if (isLoading || isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-xl">
          {isLoading ? 'Загрузка...' : 'Инициализация Google Sheets...'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {!isAuthenticated ? (
        <LoginPage />
      ) : (
        <OrderDistributionTable
          days={days}
          setDays={setDays}
          ordersMap={ordersMap}
          onOrderMove={handleOrderMove}
          hasEditAccess={hasEditAccess}
          handleCheckboxChange={handleCheckboxChange}
          getTotalArea={auth0GoogleSheetsService.getTotalArea.bind(auth0GoogleSheetsService)}
          getCellWidth={auth0GoogleSheetsService.getCellWidth.bind(auth0GoogleSheetsService)}
          orders={orders}
          setOrders={setOrders}
          googleSheetsService={auth0GoogleSheetsService}
          setError={setError}
        />
      )}
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}