import React, { useState } from 'react';
import { formatDate, getDayName } from '../utils/dateUtils';
import ConfirmationModal from './ConfirmationModal';
import { Plus, Minus, Table, Columns } from 'lucide-react';

const OrderDistributionTable = ({ 
  days = [],
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

  if (!days || !Array.isArray(days)) {
    return <div>Loading...</div>;
  }

  const executeOrderMove = async (order, sourceDate, targetDate, updateDeliveryDate = false) => {
    try {
      const rowIndex = orders.findIndex(o => o.orderNumber === order.orderNumber);
      
      await googleSheetsService.updatePlannedDate(rowIndex, targetDate);
      
      if (updateDeliveryDate) {
        await googleSheetsService.updateOrderStatus(rowIndex, order.status, targetDate);
      }
      
      const updatedOrders = await googleSheetsService.loadOrders();
      setOrders(updatedOrders);
    } catch (error) {
      console.error('Error executing order move:', error);
      setError('Ошибка при обновлении заказа');
    }
  };

  const handleOrderMove = async (order, sourceDate, targetDate) => {
    try {
      const isCompleted = order.status === 'готов' || order.status === 'выдан';

      if (isCompleted) {
        setPendingMove({
          order,
          sourceDate,
          targetDate,
          rowIndex: orders.findIndex(o => o.orderNumber === order.orderNumber)
        });
        setIsModalOpen(true);
      } else {
        await executeOrderMove(order, sourceDate, targetDate);
      }
    } catch (error) {
      console.error('Error moving order:', error);
      setError('Ошибка при перемещении заказа');
    }
  };

  const handleModalConfirm = async () => {
    if (pendingMove) {
      const { order, sourceDate, targetDate } = pendingMove;
      await executeOrderMove(order, sourceDate, targetDate, true);
    }
    setIsModalOpen(false);
    setPendingMove(null);
  };

  const handleModalClose = async () => {
    if (pendingMove) {
      const { order, sourceDate, targetDate } = pendingMove;
      await executeOrderMove(order, sourceDate, targetDate, false);
    }
    setIsModalOpen(false);
    setPendingMove(null);
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

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
        {/* Кнопки масштаба слева */}
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
        </div>

        {/* Переключатель вида справа */}
        <button
          className="p-2 border rounded hover:bg-gray-100"
          onClick={() => setView(prev => prev === 'table' ? 'kanban' : 'table')}
        >
          {view === 'table' ? <Columns className="w-6 h-6" /> : <Table className="w-6 h-6" />}
        </button>
      </div>

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
                    : 'border-blue-500'
                  : 'border-gray-200'
              }`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day)}
            >
              <div className="text-center mb-4">
                <div className="text-lg">
                  <span className="font-bold">{getDayName(day)}</span>
                  <span className="font-normal"> ({formatDate(day)}) - </span>
                  <span className="font-bold text-amber-700">{getTotalArea(dayOrders)} кв.м.</span>
                </div>
              </div>

              <div className="space-y-2">
                {dayOrders.map((order) => (
                  <div
                    key={order.orderNumber}
                    draggable={hasEditAccess}
                    onDragStart={(e) => handleDragStart(e, order, formattedDate)}
                    className={`p-2 border rounded ${
                      order.status === 'выдан' ? 'bg-green-50' : 'bg-white'
                    } ${!hasEditAccess ? 'cursor-default' : 'cursor-move'}`}
                  >
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={order.status === 'выдан'}
                          onChange={(e) => handleCheckboxChange(order, e.target.checked)}
                          disabled={!hasEditAccess}
                          className="form-checkbox"
                        />
                        <span>
                          {order.orderNumber}
                          {order.prisadkaNumber && (
                            <span className="text-red-600">{`-${order.prisadkaNumber}`}</span>
                          )}
                          {`. ${order.millingType || '        '} - ${parseFloat(order.area)}кв.м.`}
                        </span>
                      </label>
                      <div className="text-xs text-gray-500 pl-6">
                        {`${order.orderDate} • ${order.client} • ${order.payment}`}
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
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleModalConfirm}
        message="Обновить дату выдачи заказа?"
      />
    </div>
  );
};

export default OrderDistributionTable;