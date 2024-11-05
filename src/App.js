// src/App.js
import React, { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import OrderDistributionTable from './components/OrderDistributionTable';
import { googleSheetsService } from './services/googleSheetsService';
import './App.css';

function App() {
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
      initializeDays();
    }
  }, [isAuthenticated]);

  const initializeDays = () => {
    // Начальная дата (5 дней назад)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(today.getDate() - 5);
    
    // Находим максимальную дату планируемой выдачи
    const maxPlannedDate = orders.reduce((maxDate, order) => {
      if (!order.plannedDate) return maxDate;
      const plannedDate = new Date(order.plannedDate.split('.').reverse().join('-'));
      return plannedDate > maxDate ? plannedDate : maxDate;
    }, today);
    
    // Добавляем один день к максимальной дате
    const endDate = new Date(maxPlannedDate);
    endDate.setDate(endDate.getDate() + 1);
    
    console.log('Start date:', fiveDaysAgo.toLocaleDateString());
    console.log('End date:', endDate.toLocaleDateString());
    
    const newDays = [];
    let currentDate = new Date(fiveDaysAgo);
    
    // Добавляем дни от начальной до конечной даты
    while (currentDate <= endDate) {
      if (currentDate.getDay() !== 0) { // Пропускаем воскресенья
        newDays.push(new Date(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log('Generated days:', newDays.map(d => d.toLocaleDateString()));
    setDays(newDays);
  };

  const loadOrders = async () => {
    try {
      const loadedOrders = await googleSheetsService.loadOrders();
      setOrders(loadedOrders);
      initializeDays();
      
      const groupedOrders = loadedOrders.reduce((acc, order) => {
        const date = order.plannedDate;
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(order);
        return acc;
      }, {});
      setOrdersMap(groupedOrders);
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
      await loadOrders();
    } catch (error) {
      setError(error.message);
    }
  };

  const handleCheckboxChange = async (order, isChecked) => {
    try {
      const updatedOrders = await googleSheetsService.handleCheckboxChange(order, isChecked);
      setOrders(updatedOrders);
      await loadOrders();
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
    </div>
  );
}

export default App;