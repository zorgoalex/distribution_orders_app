import React, { useState, useEffect } from 'react';
import { addDays, subDays, isSunday, max } from 'date-fns';
import LoginPage from './components/LoginPage';
import OrderDistributionTable from './components/OrderDistributionTable';
import { googleSheetsService } from './services/googleSheetsService';
import './App.css';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [orders, setOrders] = useState([]);
  const [days, setDays] = useState([]);
  const [ordersMap, setOrdersMap] = useState({});
  const [error, setError] = useState(null);
  const [hasEditAccess, setHasEditAccess] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadOrders();
      checkEditAccess();
    }
  }, [isAuthenticated]);

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
      const plannedDate = new Date(order.plannedDate.split('.').reverse().join('-'));
      return max([maxDate, plannedDate]);
    }, today);
    
    let endDate = addDays(maxPlannedDate, 1);
    while (isSunday(endDate)) {
      endDate = addDays(endDate, 1);
    }
    
    console.log('Date range:', {
      start: startDate.toLocaleDateString(),
      maxPlanned: maxPlannedDate.toLocaleDateString(),
      end: endDate.toLocaleDateString()
    });
    
    const newDays = [];
    let currentDate = startDate;
    
    while (currentDate <= endDate) {
      if (!isSunday(currentDate)) {
        newDays.push(new Date(currentDate));
      }
      currentDate = addDays(currentDate, 1);
    }
    
    console.log('Generated days:', newDays.map(d => d.toLocaleDateString()));
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
      const loadedOrders = await googleSheetsService.loadOrders();
      setOrders(loadedOrders);
      // initializeDays and updateOrdersMap will be called automatically due to the useEffect
    } catch (error) {
      console.error('Error loading orders:', error);
      setError('Ошибка при загрузке заказов');
    }
  };

  const checkEditAccess = async () => {
    try {
      const hasAccess = await googleSheetsService.checkEditAccess();
      setHasEditAccess(hasAccess);
    } catch (error) {
      console.error('Error checking edit access:', error);
      setError('Ошибка при проверке прав доступа');
    }
  };

  const handleOrderMove = async (order, sourceDate, targetDate) => {
    try {
      const updatedOrders = await googleSheetsService.handleOrderMove(order, sourceDate, targetDate);
      setOrders(updatedOrders);
    } catch (error) {
      setError(error.message);
    }
  };

  const handleCheckboxChange = async (order, isChecked) => {
    try {
      const issueDate = isChecked ? order.plannedDate : null;
      const updatedOrders = await googleSheetsService.handleCheckboxChange(order, isChecked, issueDate);
      setOrders(updatedOrders);
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {!isAuthenticated ? (
        <LoginPage onLogin={() => setIsAuthenticated(true)} />
      ) : (
        <OrderDistributionTable
          days={days}
          setDays={setDays}
          ordersMap={ordersMap}
          onOrderMove={handleOrderMove}
          hasEditAccess={hasEditAccess}
          handleCheckboxChange={handleCheckboxChange}
          getTotalArea={googleSheetsService.getTotalArea.bind(googleSheetsService)}
          getCellWidth={googleSheetsService.getCellWidth.bind(googleSheetsService)}
          orders={orders}
          setOrders={setOrders}
          googleSheetsService={googleSheetsService}
          setError={setError}
        />
      )}
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}