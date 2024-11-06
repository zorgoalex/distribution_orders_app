import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { format, addDays, isSunday, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Minus, Plus, Columns, Table } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

const OrderDistributionTable = ({ 
  orders,
  setOrders,
  hasEditAccess,
  googleSheetsService,
  setError 
}) => {
  const [days, setDays] = useState([]);
  const [ordersMap, setOrdersMap] = useState({});
  const [scale, setScale] = useState('default');
  const [view, setView] = useState('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);

  useEffect(() => {
    const startDate = addDays(new Date(), -5);
    const endDate = orders.reduce((maxDate, order) => {
      const plannedDate = parseISO(order.plannedDate);
      return plannedDate > maxDate ? plannedDate : maxDate;
    }, startDate);

    const newDays = [];
    let currentDate = startDate;
    while (currentDate <= endDate) {
      if (!isSunday(currentDate)) {
        newDays.push(currentDate);
      }
      currentDate = addDays(currentDate, 1);
    }
    setDays(newDays);
  }, [orders]);

  useEffect(() => {
    const newOrdersMap = {};
    orders.forEach(order => {
      const date = order.plannedDate;
      if (!newOrdersMap[date]) {
        newOrdersMap[date] = [];
      }
      newOrdersMap[date].push(order);
    });
    setOrdersMap(newOrdersMap);
  }, [orders]);

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const sourceDate = result.source.droppableId;
    const targetDate = result.destination.droppableId;
    const orderIndex = result.source.index;

    const sourceOrders = [...ordersMap[sourceDate]];
    const [movedOrder] = sourceOrders.splice(orderIndex, 1);

    const isCompleted = movedOrder.status === 'готов' || movedOrder.status === 'выдан';

    if (isCompleted) {
      setPendingMove({
        order: movedOrder,
        sourceDate,
        targetDate
      });
      setIsModalOpen(true);
    } else {
      await executeOrderMove(movedOrder, sourceDate, targetDate);
    }
  };

  const executeOrderMove = async (order, sourceDate, targetDate, updateDeliveryDate = false) => {
    try {
      const updatedOrders = await googleSheetsService.handleOrderMove(order, sourceDate, targetDate, updateDeliveryDate);
      setOrders(updatedOrders);
    } catch (error) {
      setError('Ошибка при перемещении заказа');
    }
  };

  const handleCheckboxChange = async (order, isChecked) => {
    try {
      const updatedOrders = await googleSheetsService.handleCheckboxChange(order, isChecked);
      setOrders(updatedOrders);
    } catch (error) {
      setError('Ошибка при обновлении статуса заказа');
    }
  };

  const handleConfirmMove = async () => {
    if (pendingMove) {
      await executeOrderMove(pendingMove.order, pendingMove.sourceDate, pendingMove.targetDate, true);
    }
    setIsModalOpen(false);
    setPendingMove(null);
  };

  const handleCancelMove = () => {
    setIsModalOpen(false);
    setPendingMove(null);
  };

  const getGridColumns = () => {
    switch(scale) {
      case 'full': return 'grid-cols-7';
      case 'large': return 'grid-cols-5';
      case 'medium': return 'grid-cols-3';
      default: return 'grid-cols-1';
    }
  };

  const formatDate = (date) => format(date, 'dd.MM.yyyy', { locale: ru });

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
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
        <button
          className="p-2 border rounded hover:bg-gray-100"
          onClick={() => setView(prev => prev === 'table' ? 'kanban' : 'table')}
        >
          {view === 'table' ? <Columns className="w-6 h-6" /> : <Table className="w-6 h-6" />}
        </button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className={`grid gap-4 ${getGridColumns()}`}>
          {days.map((day) => {
            const formattedDate = formatDate(day);
            const dayOrders = ordersMap[formattedDate] || [];
            const allCompleted = dayOrders.length > 0 && dayOrders.every(order => order.status === 'выдан');

            return (
              <Droppable key={formattedDate} droppableId={formattedDate}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`p-4 rounded-lg ${allCompleted ? 'bg-green-100' : 'bg-gray-100'}`}
                  >
                    <h2 className="font-bold mb-2">{format(day, 'EEEE, d MMMM', { locale: ru })}</h2>
                    {dayOrders.length > 0 && (
                      <p className="text-brown-600 font-bold mb-2">
                        Общая площадь: {googleSheetsService.getTotalArea(dayOrders)} кв.м.
                      </p>
                    )}
                    <div className="space-y-2">
                      {dayOrders.map((order, index) => (
                        <Draggable
                          key={order.orderNumber}
                          draggableId={order.orderNumber}
                          index={index}
                          isDragDisabled={!hasEditAccess}
                        >
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`p-2 rounded 
                                ${order.status?.toLowerCase() === 'готов' ? 'border-2 border-green-500' : 'border border-gray-200'} 
                                ${order.status?.toLowerCase() === 'выдан' ? 'bg-green-50' : 'bg-white'} 
                                ${!hasEditAccess ? 'cursor-default' : 'cursor-move'}`}
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
                                    <span className="font-bold text-brown-600 text-base">{order.orderNumber}</span>
                                    {order.prisadkaNumber && (
                                      <span className="font-bold text-red-600 text-base">{`-${order.prisadkaNumber}`}</span>
                                    )}
                                    <span className="text-xs">
                                      {`. ${order.millingType || '\u00A0'.repeat(8)} - ${parseFloat(order.area).toFixed(2)}кв.м.`}
                                    </span>
                                  </span>
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
                            </div>
                          )}
                        </Draggable>
                      ))}
                    </div>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
      <ConfirmationModal
        isOpen={isModalOpen}
        onConfirm={handleConfirmMove}
        onCancel={handleCancelMove}
        message="Вы уверены, что хотите переместить завершенный заказ? Это изменит дату выдачи."
      />
    </div>
  );
};

export default OrderDistributionTable;