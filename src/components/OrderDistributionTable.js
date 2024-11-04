import React, { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { format, addDays, subDays, isWeekend } from 'date-fns';
import { ru } from 'date-fns/locale';
import { googleSheetsService } from '../services/googleSheetsService';
import { STATUSES } from '../constants';

// Компонент модального окна
const ConfirmationModal = ({ isOpen, onClose, onConfirm, date }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 className="text-lg font-medium mb-4">
          Изменить дату выдачи выполненного заказа на {date}?
        </h3>
        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Нет
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Ок
          </button>
        </div>
      </div>
    </div>
  );
};

function OrderDistributionTable() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);

  // Получение дат для отображения (неделя)
  const dates = useMemo(() => {
    const startDate = subDays(selectedDate, 2);
    return Array.from({ length: 12 }, (_, index) => {
      const date = addDays(startDate, index);
      return format(date, 'dd.MM.yyyy');
    }).filter(date => {
      const dayOfWeek = new Date(date.split('.').reverse().join('-')).getDay();
      return dayOfWeek !== 0; // Исключаем воскресенья
    });
  }, [selectedDate]);

  // Загрузка заказов
  useEffect(() => {
    const loadOrders = async () => {
      try {
        setLoading(true);
        const fetchedOrders = await googleSheetsService.loadOrders();
        setOrders(fetchedOrders);
        setError(null);
      } catch (err) {
        setError('Ошибка при загрузке заказов');
        console.error('Error loading orders:', err);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, []);

  // Отслеживание изменений
  useEffect(() => {
    let unsubscribe;

    const setupWatcher = async () => {
      try {
        unsubscribe = await googleSheetsService.watchForChanges((updatedOrders) => {
          setOrders(updatedOrders);
        });
      } catch (error) {
        console.error('Error setting up watcher:', error);
      }
    };

    setupWatcher();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Группировка заказов по датам
  const ordersByDate = useMemo(() => {
    return dates.reduce((acc, date) => {
      acc[date] = orders.filter(order => order.plannedDate === date);
      return acc;
    }, {});
  }, [orders, dates]);

  // Подсчет общей площади для даты
  const calculateTotalArea = (date) => {
    return ordersByDate[date]?.reduce((sum, order) => sum + (order.area || 0), 0) || 0;
  };

  // Обработка переноса заказа
  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const sourceDate = result.source.droppableId;
    const targetDate = result.destination.droppableId;
    
    if (sourceDate === targetDate) return;

    const order = ordersByDate[sourceDate].find(
      (o, index) => index === result.source.index
    );

    await handleOrderMove(order, sourceDate, targetDate);
  };

  // Обработка переноса заказа с проверкой статуса
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

  // Выполнение переноса заказа
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

  // Обработчики модального окна
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

  // Обработка изменения статуса заказа
  const handleStatusChange = async (order, rowIndex) => {
    try {
      const currentDate = format(new Date(), 'dd.MM.yyyy');
      await googleSheetsService.updateOrderStatus(rowIndex, STATUSES.COMPLETED, currentDate);
      
      const updatedOrders = await googleSheetsService.loadOrders();
      setOrders(updatedOrders);
    } catch (error) {
      console.error('Error updating order status:', error);
      setError('Ошибка при обновлении статуса заказа');
    }
  };

  if (loading) {
    return <div className="text-center py-4">Загрузка...</div>;
  }

  if (error) {
    return <div className="text-center py-4 text-red-500">{error}</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-6 gap-4">
          {dates.map((date) => (
            <div key={date} className="border rounded-lg p-2">
              <div className="text-center mb-2">
                <div className="font-bold">
                  {format(new Date(date.split('.').reverse().join('-')), 'EEEE', { locale: ru })}
                </div>
                <div>{date}</div>
                <div className="text-sm text-gray-600">
                  Общая площадь: {calculateTotalArea(date).toFixed(2)} м²
                </div>
              </div>
              
              <Droppable droppableId={date}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="min-h-[100px]"
                  >
                    {ordersByDate[date]?.map((order, index) => (
                      <Draggable
                        key={order.orderNumber}
                        draggableId={order.orderNumber}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`p-2 mb-2 rounded ${
                              order.status === STATUSES.COMPLETED
                                ? 'bg-gray-200'
                                : 'bg-white'
                            } border ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                          >
                            <div className="flex items-center justify-between">
                              <input
                                type="checkbox"
                                checked={order.status === STATUSES.COMPLETED}
                                onChange={() => handleStatusChange(order, index)}
                                className="mr-2"
                              />
                              <div>
                                <div>
                                  {order.orderNumber}. {order.millingType}.{' '}
                                  {order.area} кв.м.
                                </div>
                                <div className="text-sm text-gray-600">
                                  {order.orderDate} - {order.client}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {order.payment} - {order.phone}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        date={pendingMove?.targetDate || ''}
      />
    </div>
  );
}

export default OrderDistributionTable;