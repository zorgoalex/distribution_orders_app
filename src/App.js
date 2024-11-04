// src/App.js
import React, { useState } from 'react';
import LoginPage from './components/LoginPage';
import OrderDistributionTable from './components/OrderDistributionTable';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {!isAuthenticated ? (
        <LoginPage onLogin={() => setIsAuthenticated(true)} />
      ) : (
        <OrderDistributionTable />
      )}
    </div>
  );
}

export default App;