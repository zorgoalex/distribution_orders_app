import React, { useState, useEffect, useCallback } from 'react';
import { formatDate, getDayName } from '../utils/dateUtils';
import ConfirmationModal from './ConfirmationModal';
import { Plus, Minus, Table, Columns, PencilIcon, LayoutList, LayoutGrid, Coins } from 'lucide-react';

const OrderDistributionTable = ({ 
  days,
  setDays,
  ordersMap = {},
  onOrderMove, 
  hasEditAccess, 
  handleCheckboxChange,
  getTotalArea,
  getCellWidth,
  orders = [],
  setOrders,
  googleSheetsService,
  setError 
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);
  const [columnsCount, setColumnsCount] = useState(7); // Начальное количество столбцов
  const [view, setView] = useState('table');
  const [userInfo, setUserInfo] = useState(null);
  const [cardView, setCardView] = useState('default');

  // Константы для масштабирования
  const MAX_COLUMNS = 7; // Максимальное количество столбцов
  const MIN_COLUMNS = 1; // Минимальное количество столбцов

  const handleZoomOut = useCallback(() => {
    setColumnsCount(prev => Math.min(prev + 1, MAX_COLUMNS));
  }, []);

  const handleZoomIn = useCallback(() => {
    setColumnsCount(prev => Math.max(prev - 1, MIN_COLUMNS));
  }, []);

  const executeOrderMove = async (order, sourceDate, targetDate, updateDeliveryDate = false) => {
    try {
      console.log('executeOrderMove - START', {
        orderNumber: order.orderNumber,
        sourceDate,
        targetDate,
        updateDeliveryDate
      });

      const rowIndex = orders.findIndex(o => o.orderNumber === order.orderNumber);
      console.log('Found row index:', rowIndex);
      
      await googleSheetsService.updatePlannedDate(rowIndex, targetDate);
      console.log('Updated planned date');
      
      if (updateDeliveryDate) {
        console.log('Updating delivery date');
        await googleSheetsService.updateOrderStatus(rowIndex, order.status, targetDate);
      }
      
      const updatedOrders = await googleSheetsService.loadOrders();
      setOrders(updatedOrders);
      console.log('executeOrderMove - END');
    } catch (error) {
      console.error('Error executing order move:', error);
      setError('Ошибка при обновлении заказа');
    }
  };

  const handleOrderMove = async (order, sourceDate, targetDate) => {
    try {
      console.log('Moving order:', {
        orderNumber: order.orderNumber,
        status: order.status,
        sourceDate,
        targetDate
      });

      if (order.status?.toLowerCase() === 'выдан') {
        console.log('Order is issued, showing modal');
        setPendingMove({
          order,
          sourceDate,
          targetDate,
          rowIndex: orders.findIndex(o => o.orderNumber === order.orderNumber)
        });
        setIsModalOpen(true);
      } else {
        console.log('Order is not issued, moving directly');
        await executeOrderMove(order, sourceDate, targetDate);
      }
    } catch (error) {
      console.error('Error moving order:', error);
      setError('Ошибка при перемещении заказа');
    }
  };

  const handleModalConfirm = async () => {
    console.log('Modal confirmed - START');
    if (pendingMove) {
      console.log('PendingMove data:', pendingMove);
      const { order, sourceDate, targetDate } = pendingMove;
      await executeOrderMove(order, sourceDate, targetDate, true);
    }
    setIsModalOpen(false);
    setPendingMove(null);
    console.log('Modal confirmed - END');
  };

  const handleModalClose = async () => {
    console.log('Modal closed - START');
    if (pendingMove) {
      console.log('PendingMove data:', pendingMove);
      const { order, sourceDate, targetDate } = pendingMove;
      await executeOrderMove(order, sourceDate, targetDate, false);
    }
    setIsModalOpen(false);
    setPendingMove(null);
    console.log('Modal closed - END');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragStart = (e, order, sourceDate) => {
    e.dataTransfer.setData('order', JSON.stringify(order));
    e.dataTransfer.setData('sourceDate', sourceDate);
  };

  const handleDrop = (e, targetDate) => {
    e.preventDefault();
    const order = JSON.parse(e.dataTransfer.getData('order'));
    const sourceDate = e.dataTransfer.getData('sourceDate');
    handleOrderMove(order, sourceDate, targetDate);
  };

  // Основная сетка с динамическим количеством столбцов
  const mainGridStyles = {
    display: view === 'kanban' ? 'flex' : 'grid',
    gridTemplateColumns: view === 'table' ? `repeat(${columnsCount}, minmax(0, 1fr))` : undefined,
    overflowX: view === 'kanban' ? 'auto' : undefined,
    gap: '0.5rem'
  };

  useEffect(() => {
    console.log('Orders with status:', orders.map(order => ({
      number: order.orderNumber,
      status: order.status
    })));
  }, [orders]);

  useEffect(() => {
    if (pendingMove) {
      const updatedOrder = orders.find(o => o.orderNumber === pendingMove.order.orderNumber);
      if (updatedOrder) {
        setPendingMove(prev => ({
          ...prev,
          order: updatedOrder
        }));
      }
    }
  }, [orders, pendingMove]);

  useEffect(() => {
    const loadUserInfo = async () => {
      const info = await googleSheetsService.getUserInfo();
      setUserInfo(info);
    };
    loadUserInfo();
  }, []);

  return (
    <div className="p-4">
      <div className="fixed top-0 left-0 right-0 bg-gray-50 z-50 border-b border-gray-200">
        <div className="flex justify-between p-4 mx-4">
          <div className="flex gap-2">
            <button 
              className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleZoomOut}
              disabled={columnsCount >= MAX_COLUMNS}
            >
              <Minus className="w-6 h-6" />
            </button>
            <button 
              className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleZoomIn}
              disabled={columnsCount <= MIN_COLUMNS}
            >
              <Plus className="w-6 h-6" />
              </button>
            <div className="border-l border-gray-200 mx-2" />
            <button
              className="p-2 border rounded hover:bg-gray-100"
              onClick={() => setCardView(prev => prev === 'default' ? 'compact' : 'default')}
            >
              {cardView === 'default' ? 
                <LayoutList className="w-6 h-6" /> : 
                <LayoutGrid className="w-6 h-6" />
              }
            </button>
          </div>

          <div className="flex items-center gap-4">
            {userInfo && (
              <span className="text-gray-600">
                {userInfo.emailAddress}
              </span>
            )}
            <button
              className="p-2 border rounded hover:bg-gray-100"
              onClick={() => setView(prev => prev === 'table' ? 'kanban' : 'table')}
            >
              {view === 'table' ? <Columns className="w-6 h-6" /> : <Table className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-20">
        <div style={mainGridStyles}>
          {days.map((day) => {
            const formattedDate = formatDate(day);
            const dayOrders = ordersMap[formattedDate] || [];
            const allCompleted = dayOrders.length > 0 && dayOrders.every(order => order.status === 'выдан');

            return (
              <div
                key={formatDate(day)}
                className={`border border-gray-300 p-2 rounded ${
                  dayOrders.length 
                    ? allCompleted
                      ? 'border-green-50'
                      : 'border-blue-500'
                    : 'border-gray-200'
                }`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, day)}
                style={{ minWidth: view === 'kanban' ? '300px' : undefined }}
              >
                <div className="text-center mb-4">
                  <div className="text-lg">
                    <span className="font-bold">{getDayName(day)}</span>
                    <span className="font-normal"> ({formatDate(day)})</span>
                    {dayOrders.length > 0 && (
                      <>
                        <span className="font-normal"> - </span>
                        <span className="font-bold text-amber-700">
                          {(() => {
                            const rawTotal = getTotalArea(dayOrders);
                            const number = parseFloat(rawTotal);
                            const formatted = number.toFixed(2);
                            return formatted;
                          })()} кв.м.
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {dayOrders.map((order) => (
                    <div
                      key={order.orderNumber}
                      draggable={hasEditAccess}
                      onDragStart={(e) => handleDragStart(e, order, formattedDate)}
                      className={`p-2 pb-4 rounded relative ${
                        order.status?.toLowerCase() === 'готов' ? 'border-2 border-green-500' : 'border border-gray-200'
                      } ${order.status?.toLowerCase() === 'выдан' ? 'bg-green-50' : 'bg-white'} 
                      ${!hasEditAccess ? 'cursor-default' : 'cursor-move'} min-h-[60px]`}
                    >
                      {cardView === 'compact' ? (
                        <div className="flex flex-col gap-1">
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={order.status?.toLowerCase() === 'выдан'}
                              onChange={(e) => handleCheckboxChange(order, e.target.checked)}
                              disabled={!hasEditAccess}
                              className="form-checkbox mt-1"
                            />
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-blue-600 text-[1.32rem]">
                                  {order.orderNumber}
                                  {order.prisadkaNumber && (
                                    <span className="font-bold text-red-600">{`-${order.prisadkaNumber}`}</span>
                                  )}
                                </span>
                              </div>
                              {cardView === 'compact' && order.material && order.material !== '16мм' && (
                                <span className={`text-sm italic px-1 rounded ${
                                  order.material === '18мм' ? 'text-red-600 bg-amber-100' :
                                  order.material === '10мм' ? 'text-blue-600 bg-blue-100' :
                                  order.material === 'ЛДСП' ? 'text-purple-600 bg-purple-100' :
                                  'text-red-600 bg-amber-100'
                                }`}>
                                  {order.material}
                                </span>
                              )}
                              <div className="flex items-center gap-2 text-sm">
                                <span>
                                  {order.millingType ? order.millingType.charAt(0).toUpperCase() : ''} - {parseFloat(order.area.replace(',', '.')).toFixed(2)}
                                </span>
                                {order.payment?.toLowerCase() === 'оплачен' && (
                                  <Coins 
                                    className="text-yellow-500"
                                    style={{ 
                                      width: '18px',
                                      height: '18px'
                                    }} 
                                  />
                                )}
                              </div>
                            </div>
                          </label>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={order.status?.toLowerCase() === 'выдан'}
                              onChange={(e) => handleCheckboxChange(order, e.target.checked)}
                              disabled={!hasEditAccess}
                              className="form-checkbox"
                            />
                            <div className={`${columnsCount === 1 ? '' : 'pt-6'}`}>
                              <span>
                                <span className="font-bold text-blue-600 text-xl">{order.orderNumber}</span>
                                {order.prisadkaNumber && (
                                  <span className="font-bold text-red-600 text-xl">{`-${order.prisadkaNumber}`}</span>
                                )}
                              </span>
                              <div className="text-xs">
                                {`. ${order.millingType || '\u00A0'.repeat(8)} - ${parseFloat(order.area.replace(',', '.')).toFixed(2)}кв.м.`}
                              </div>
                            </div>
                          </label>
                          <div className="text-xs text-gray-500 pl-6">
                            {`${order.orderDate} • ${order.client} • `}
                            <span className={order.payment === 'Не оплачен' ? 'underline decoration-red-500 decoration-2' : ''}>
                              {order.payment}
                            </span>
                            {order.status?.toLowerCase() === 'выдан' && (
                              <> • <span>{order.status}</span></>
                            )}
                            {order.phone && (
                              <>
                                {' • '}
                                <a 
                                  href={`tel:${order.phone}`}
                                  className="text-blue-500 hover:text-blue-700"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {order.phone}
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {cardView !== 'compact' && order.material && order.material !== '16мм' && (
                        <span className={`absolute top-1 right-2 italic px-1 rounded ${
                          order.material === '18мм' ? 'text-red-600 bg-amber-100' :
                          order.material === '10мм' ? 'text-blue-600 bg-blue-100' :
                          order.material === 'ЛДСП' ? 'text-purple-600 bg-purple-100' :
                          'text-red-600 bg-amber-100'
                        }`} style={{ fontSize: '14px' }}>
                          {order.material}
                        </span>
                      )}
                      
                      {order.cadFiles?.toLowerCase() === 'отрисован' && (
                        <PencilIcon 
                          className="absolute right-2 text-[#7C3AED] font-thin"
                          style={{ 
                            fontSize: '18px',
                            width: '18px',
                            height: '18px',
                            transform: 'rotate(-20deg)',
                            top: '28px'
                          }} 
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        message="Обновить дату выдачи заказа?"
      />
    </div>
  );
};

export default OrderDistributionTable;