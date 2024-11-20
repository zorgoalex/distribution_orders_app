import React, { useState, useEffect } from 'react';
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
  const [scale, setScale] = useState('default'); // 'default', 'medium', 'large', 'full'
  const [view, setView] = useState('table'); // 'table', 'kanban'
  const [userInfo, setUserInfo] = useState(null);
  const [cardView, setCardView] = useState('default'); // 'default' или 'compact'

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

  const getGridColumns = () => {
    if (view === 'kanban') {
      return 'flex overflow-x-auto';
    }
    switch(scale) {
      case 'default':
        return 'grid grid-cols-7';
      case 'medium':
        return 'grid grid-cols-4';
      case 'large':
        return 'grid grid-cols-2';
      case 'full':
        return 'grid grid-cols-1';
      default:
        return 'grid grid-cols-7';
    }
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
  }, [orders]);

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
              className="p-2 border rounded hover:bg-gray-100"
              onClick={() => setScale(prev => {
                switch(prev) {
                  case 'full': return 'large';
                  case 'large': return 'medium';
                  case 'medium': return 'default';
                  default: return 'default';
                }
              })}
            >
              <Minus className="w-6 h-6" />
            </button>
            <button 
              className="p-2 border rounded hover:bg-gray-100"
              onClick={() => setScale(prev => {
                switch(prev) {
                  case 'default': return 'medium';
                  case 'medium': return 'large';
                  case 'large': return 'full';
                  default: return 'full';
                }
              })}
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
        <div className={getGridColumns()}>
          {days.map((day) => {
            const formattedDate = formatDate(day);
            const dayOrders = ordersMap[formattedDate] || [];
            const allCompleted = dayOrders.length > 0 && dayOrders.every(order => order.status === 'выдан');

            return (
              <div
                key={formatDate(day)}
                className={`border-2 rounded p-4 ${getCellWidth()} ${
                  dayOrders.length 
                    ? allCompleted
                      ? 'border-green-50'
                      : 'border-amber-200'
                    : 'border-gray-200'
                }`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, day)}
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
                            console.log('Raw total:', rawTotal);
                            
                            const number = parseFloat(rawTotal);
                            console.log('Parsed number:', number);
                            
                            const formatted = number.toFixed(2);
                            console.log('Formatted:', formatted);
                            
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
                      {cardView === 'default' ? (
                        <div className="flex flex-col gap-1">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={order.status?.toLowerCase() === 'выдан'}
                              onChange={(e) => handleCheckboxChange(order, e.target.checked)}
                              disabled={!hasEditAccess}
                              className="form-checkbox"
                            />
                            <div className={`${scale === 'default' ? '' : 'pt-6'}`}>
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
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-blue-600 text-lg">
                                {order.orderNumber}
                                {order.prisadkaNumber && (
                                  <span className="font-bold text-red-600">{`-${order.prisadkaNumber}`}</span>
                                )}
                              </span>
                              <span className="text-sm">
                                {order.millingType ? order.millingType.charAt(0).toUpperCase() : ''} - {parseFloat(order.area.replace(',', '.')).toFixed(2)}
                              </span>
                            </div>
                          </label>
                        </div>
                      )}
                      
                      {order.material && order.material !== '16мм' && (
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
                      
                      {cardView === 'compact' && order.payment?.toLowerCase() === 'оплачен' && (
                        <Coins 
                          className="absolute left-8 text-yellow-500"
                          style={{ 
                            width: '18px',
                            height: '18px',
                            top: '35px'
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