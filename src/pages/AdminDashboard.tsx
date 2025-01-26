import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, RefreshCcw, Search, Filter, ChevronDown, UtensilsCrossed, Settings, LayoutGrid, MoreVertical, X, Clock, MapPin, CreditCard, Printer, Bell, BellOff } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useSoundStore } from '../hooks/useSound';

const ORDER_STATUSES = [
  { value: 'pending', label: 'Pendentes', color: 'bg-yellow-100 text-yellow-800', icon: '🟡' },
  { value: 'accepted', label: 'Aceito', color: 'bg-purple-100 text-purple-800', icon: '🟣' },
  { value: 'preparing', label: 'Preparo', color: 'bg-orange-100 text-orange-800', icon: '🟠' },
  { value: 'delivering', label: 'Entrega', color: 'bg-blue-100 text-blue-800', icon: '🔵' },
  { value: 'completed', label: 'Concluído', color: 'bg-green-100 text-green-800', icon: '🟢' }
];

function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isRestaurantOpen, setIsRestaurantOpen] = useState(true);
  const { isSoundEnabled, toggleSound } = useSoundStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    audioRef.current = new Audio('/notification.mp3');

    // Adiciona evento de clique para fechar o menu ao clicar fora
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    if (isSoundEnabled) {
      try {
        const context1 = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator1 = context1.createOscillator();
        const gainNode1 = context1.createGain();

        oscillator1.connect(gainNode1);
        gainNode1.connect(context1.destination);

        oscillator1.type = 'sine';
        oscillator1.frequency.setValueAtTime(800, context1.currentTime);
        gainNode1.gain.setValueAtTime(0.3, context1.currentTime);

        oscillator1.start();
        gainNode1.gain.exponentialRampToValueAtTime(0.01, context1.currentTime + 0.3);
        
        setTimeout(() => {
          oscillator1.stop();
          context1.close();

          // Segunda vez (após 500ms)
          const context2 = new (window.AudioContext || (window as any).webkitAudioContext)();
          const oscillator2 = context2.createOscillator();
          const gainNode2 = context2.createGain();

          oscillator2.connect(gainNode2);
          gainNode2.connect(context2.destination);

          oscillator2.type = 'sine';
          oscillator2.frequency.setValueAtTime(800, context2.currentTime);
          gainNode2.gain.setValueAtTime(0.3, context2.currentTime);

          oscillator2.start();
          gainNode2.gain.exponentialRampToValueAtTime(0.01, context2.currentTime + 0.3);

          setTimeout(() => {
            oscillator2.stop();
            context2.close();
          }, 300);
        }, 500);

      } catch (error) {
        console.error('Erro ao tocar som:', error);
      }
    }
  }, [isSoundEnabled]);

  useEffect(() => {
    fetchOrders();
    
    // Criar canal de tempo real com retry
    const setupRealtimeSubscription = () => {
      const channel = supabase
        .channel('orders_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders'
          },
          async (payload) => {
            console.log('Received real-time update:', payload);
            
            if (payload.eventType === 'UPDATE') {
              // Buscar o pedido atualizado completo para garantir todos os dados
              const { data: updatedOrder, error } = await supabase
                .from('orders')
                .select(`
                  id,
                  created_at,
                  updated_at,
                  status,
                  customer_name,
                  phone,
                  address,
                  delivery_type,
                  total,
                  observation,
                  order_items!inner (
                    id,
                    quantity,
                    price,
                    extras,
                    product:products!inner (
                      id,
                      name,
                      image_url
                    ),
                    variation:product_variations (
                      id,
                      size
                    )
                  )
                `)
                .eq('id', payload.new.id)
                .single();

              if (error) {
                console.error('Erro ao buscar pedido atualizado:', error);
                return;
              }

              if (updatedOrder) {
                setOrders(prevOrders => 
                  prevOrders.map(order => 
                    order.id === updatedOrder.id 
                      ? updatedOrder
                      : order
                  )
                );
                // Tocar som de notificação apenas se o status mudou
                if (payload.old.status !== payload.new.status) {
                  playNotificationSound();
                }
              }
            } else if (payload.eventType === 'INSERT') {
              const { data: newOrder, error } = await supabase
                .from('orders')
                .select(`
                  id,
                  created_at,
                  updated_at,
                  status,
                  customer_name,
                  phone,
                  address,
                  delivery_type,
                  total,
                  observation,
                  order_items!inner (
                    id,
                    quantity,
                    price,
                    extras,
                    product:products!inner (
                      id,
                      name,
                      image_url
                    ),
                    variation:product_variations (
                      id,
                      size
                    )
                  )
                `)
                .eq('id', payload.new.id)
                .single();

              if (error) {
                console.error('Erro ao buscar novo pedido:', error);
                return;
              }

              if (newOrder) {
                setOrders(prevOrders => [newOrder, ...prevOrders]);
                playNotificationSound();
                toast.success('Novo pedido recebido!');
              }
            } else if (payload.eventType === 'DELETE') {
              setOrders(prevOrders => 
                prevOrders.filter(order => order.id !== payload.old.id)
              );
            }
          }
        )
        .subscribe((status) => {
          console.log('Subscription status:', status);
          
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to real-time updates');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Error in real-time channel');
            // Tentar reconectar após 5 segundos
            setTimeout(setupRealtimeSubscription, 5000);
          }
        });

      return channel;
    };

    const channel = setupRealtimeSubscription();

    // Cleanup function
    return () => {
      channel.unsubscribe();
    };
  }, [playNotificationSound]);

  const fetchOrders = async () => {
    try {
      console.log('Iniciando busca de pedidos...');
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          updated_at,
          status,
          customer_name,
          phone,
          address,
          delivery_type,
          total,
          observation,
          order_items!inner (
            id,
            quantity,
            price,
            extras,
            product:products!inner (
              id,
              name,
              image_url
            ),
            variation:product_variations (
              id,
              size
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro detalhado ao buscar pedidos:', {
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      console.log('Pedidos recebidos:', data?.length || 0);
      setOrders(data || []);
    } catch (error) {
      console.error('Erro completo ao buscar pedidos:', error);
      toast.error('Erro ao carregar pedidos. Verifique o console para mais detalhes.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus, e) => {
    e.stopPropagation();
    try {
      // Atualizar o status no banco de dados
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;

      // Atualizar o pedido localmente
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === orderId
            ? { ...order, status: newStatus, updated_at: new Date().toISOString() }
            : order
        )
      );

      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => ({
          ...prev,
          status: newStatus,
          updated_at: new Date().toISOString()
        }));
      }

      toast.success('Status atualizado com sucesso');
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const handlePrintOrder = async (order) => {
    // Atualiza o status do pedido para 'accepted'
    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) {
        console.error('Error updating order status:', error);
        toast.error('Erro ao atualizar status do pedido');
        return;
      }

      toast.success('Pedido aceito e impresso!');
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Erro ao atualizar status do pedido');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Erro ao abrir janela de impressão');
      return;
    }
    
    const printStyles = `
      <style>
        @page {
          margin: 1mm;
          size: 80mm auto;
        }
        body {
          font-family: 'Courier New', monospace;
          margin: 0;
          padding: 8px;
          width: 80mm;
          font-size: 14px;
          line-height: 1.3;
        }
        .header {
          text-align: center;
          border-bottom: 1px dashed #000;
          padding-bottom: 8px;
          margin-bottom: 8px;
        }
        .header h1 {
          font-size: 24px;
          margin: 0;
          padding: 0;
        }
        .header p {
          margin: 4px 0;
          font-size: 16px;
        }
        .divider {
          border-bottom: 1px dashed #000;
          margin: 8px 0;
        }
        .order-info {
          margin-bottom: 8px;
          font-size: 16px;
        }
        .order-info p {
          margin: 4px 0;
        }
        .items-table {
          width: 100%;
          margin: 8px 0;
          font-size: 16px;
        }
        .items-table td {
          padding: 4px 0;
        }
        .item-row {
          margin: 6px 0;
          font-size: 16px;
        }
        .quantity {
          width: 30px;
          text-align: center;
        }
        .price {
          text-align: right;
        }
        .total {
          text-align: right;
          font-weight: bold;
          border-top: 1px dashed #000;
          padding-top: 8px;
          margin-top: 8px;
          font-size: 16px;
        }
        .footer {
          text-align: center;
          margin-top: 16px;
          font-size: 14px;
        }
        @media print {
          .no-print { display: none; }
        }
      </style>
    `;

    const getStatusLabel = (status) => {
      const statusObj = ORDER_STATUSES.find(s => s.value === status);
      return statusObj ? statusObj.label : status;
    };

    const formatDateTime = (date) => {
      const d = new Date(date);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pedido #${order.id.slice(0, 4)}</title>
          <meta charset="UTF-8">
          ${printStyles}
        </head>
        <body>
          <div class="header">
            <h1>Chapa Quente</h1>
            <p>================================</p>
            <p>PEDIDO #${order.id.slice(0, 4)}</p>
            <p>${formatDateTime(order.created_at)}</p>
          </div>

          <div class="order-info">
            <p>CLIENTE: ${order.customer_name}</p>
            <p>TELEFONE: ${order.phone}</p>
            <p>TIPO: ${order.delivery_type === 'delivery' ? 'ENTREGA' : 
                      order.delivery_type === 'pickup' ? 'RETIRADA' : 
                      order.delivery_type === 'table' ? 'MESA' : ''}</p>
            ${order.address ? `<p>${order.delivery_type === 'table' ? 'MESA:' : 'ENDEREÇO:'} ${order.address}</p>` : ''}
            <p>STATUS: ${getStatusLabel(order.status)}</p>
          </div>

          <div class="divider"></div>
          <p style="text-align: center;">ITENS DO PEDIDO</p>
          <div class="divider"></div>

          ${order.order_items.map(item => `
            <div class="item-row">
              <div>${item.quantity}x ${item.product.name}${item.variation?.size ? ` (${item.variation.size})` : ''}</div>
              <div style="display: flex; justify-content: space-between;">
                <span>R$ ${item.price.toFixed(2)} un</span>
                <span>R$ ${(item.quantity * item.price).toFixed(2)}</span>
              </div>
              ${item.extras && item.extras.length > 0 ? `
                <div style="margin-left: 20px; font-size: 14px;">
                  <p style="margin: 2px 0;">Adicionais:</p>
                  ${item.extras.map(extra => `
                    <div style="display: flex; justify-content: space-between;">
                      <span>• ${extra.name}</span>
                      <span>R$ ${extra.price.toFixed(2)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `).join('')}

          <div class="total">
            <p style="margin: 4px 0; font-size: 16px;">SUBTOTAL: R$ ${order.total.toFixed(2)}</p>
            ${order.delivery_type === 'delivery' ? `
              <p style="margin: 4px 0; font-size: 16px;">TAXA DE ENTREGA: R$ 3,00</p>
              <p style="margin: 4px 0; font-size: 18px; font-weight: bold;">TOTAL: R$ ${(Number(order.total) + 3).toFixed(2)}</p>
            ` : `
              <p style="margin: 4px 0; font-size: 18px; font-weight: bold;">TOTAL: R$ ${order.total.toFixed(2)}</p>
            `}
          </div>

          ${order.observation ? `
            <div class="observation">
              <p><strong>OBSERVAÇÕES:</strong> ${order.observation}</p>
            </div>
          ` : ''}
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  const toggleRestaurantStatus = async () => {
    const newStatus = !isRestaurantOpen;
    const { error } = await supabase
      .from('restaurant_settings')
      .upsert({ id: 1, is_open: newStatus });

    if (error) {
      toast.error('Erro ao alterar o status do restaurante');
    } else {
      setIsRestaurantOpen(newStatus);
      toast.success(newStatus ? 'Restaurante aberto!' : 'Restaurante fechado!');
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const getTimeAgo = (date) => {
    const minutes = Math.floor((new Date() - new Date(date)) / 60000);
    return `Recebido há ${minutes} minutos`;
  };

  const renderOrderItems = (items) => {
    return items.map((item, index) => (
      <div key={index} className="flex items-start space-x-3 mb-2">
        {item.product?.image_url && (
          <img
            src={item.product.image_url}
            alt={item.product.name}
            className="w-16 h-16 object-cover rounded"
          />
        )}
        <div className="flex-1">
          <div className="flex justify-between">
            <span className="font-medium">
              {item.quantity}x {item.product?.name}
              {item.variation?.size && ` (${item.variation.size})`}
            </span>
            <span className="text-gray-600">
              R$ {(item.price * item.quantity).toFixed(2)}
            </span>
          </div>
          {item.extras && item.extras.length > 0 && (
            <div className="mt-1 text-sm text-gray-600">
              <p className="font-medium">Adicionais:</p>
              {item.extras.map((extra, idx) => (
                <div key={idx} className="flex justify-between pl-2">
                  <span>• {extra.name}</span>
                  <span>R$ {extra.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin">
          <RefreshCcw className="w-8 h-8 text-purple-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fe]">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="bg-purple-500 p-2 rounded-lg">
                  <UtensilsCrossed className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-lg font-semibold text-gray-900">Pedidos</h1>
              </div>
              
              {/* Status Filters */}
              <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {ORDER_STATUSES.map(status => (
                  <button
                    key={status.value}
                    onClick={() => setStatusFilter(status.value)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap min-w-fit
                      ${statusFilter === status.value ? status.color : 'bg-gray-100 text-gray-600'}`}
                  >
                    <span>{status.icon}</span>
                    <span>{status.label}</span>
                    <span className="bg-white bg-opacity-50 px-1.5 rounded-full">
                      {orders.filter(o => o.status === status.value).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="p-2 text-gray-500 hover:text-gray-700">
                <Search className="w-5 h-5" />
              </button>
              <div ref={settingsRef} className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <Settings className="w-5 h-5" />
                </button>

                {showSettings && (
                  <div className="absolute right-4 top-16 w-56 bg-white rounded-md shadow-lg z-50">
                    <div className="p-2">
                      <button
                        onClick={() => toggleSound()}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md flex items-center"
                      >
                        {isSoundEnabled ? <Bell className="w-4 h-4 mr-2" /> : <BellOff className="w-4 h-4 mr-2" />}
                        {isSoundEnabled ? 'Desativar Som' : 'Ativar Som'}
                      </button>
                      
                      <button
                        onClick={toggleRestaurantStatus}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md flex items-center"
                      >
                        <Clock className="w-4 h-4 mr-2" />
                        {isRestaurantOpen ? 'Fechar Restaurante' : 'Abrir Restaurante'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              onClick={() => setSelectedOrder(order)}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-medium text-gray-900">#{order.id.slice(0, 4)}</h3>
                  <p className="text-sm text-gray-500">{getTimeAgo(order.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={order.status}
                    onChange={(e) => handleStatusChange(order.id, e.target.value, e)}
                    className={`px-3 py-1 text-sm rounded-full border-0 font-medium ${
                      ORDER_STATUSES.find(s => s.value === order.status)?.color
                    }`}
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOrder(order);
                    }} 
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                    {order.customer_name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{order.customer_name}</p>
                    <p className="text-sm text-gray-500">{order.phone}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className={`px-2 py-0.5 rounded-full ${
                    order.delivery_type === 'delivery' 
                      ? 'bg-blue-100 text-blue-800' 
                      : order.delivery_type === 'pickup' 
                        ? 'bg-orange-100 text-orange-800' 
                        : order.delivery_type === 'table' 
                          ? 'bg-green-100 text-green-800' 
                          : ''
                  }`}>
                    {order.delivery_type === 'delivery' ? 'Entrega' : 
                      order.delivery_type === 'pickup' ? 'Retirada' : 
                      order.delivery_type === 'table' ? 'Mesa' : ''}
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-500">
                    {order.order_items.reduce((acc, item) => acc + item.quantity, 0)} itens
                  </span>
                </div>

                <div className="pt-2 border-t">
                  <p className="font-medium text-gray-900">
                    R$ {order.total.toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {order.order_items.map(item => `${item.product.name}${item.variation?.size ? ` (${item.variation.size})` : ''}`).join(', ')}
                  </p>
                  {order.observation && (
                    <p className="text-sm text-gray-500 mt-1">
                      <strong>Observação:</strong> {order.observation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">Nenhum pedido encontrado</p>
          </div>
        )}
      </main>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold">
                  Pedido #{selectedOrder.id.slice(0, 4)}
                </h2>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => handleStatusChange(selectedOrder.id, e.target.value, e)}
                  className={`px-3 py-1 text-sm rounded-full border-0 font-medium ${
                    ORDER_STATUSES.find(s => s.value === selectedOrder.status)?.color
                  }`}
                >
                  {ORDER_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintOrder(selectedOrder)}
                  className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  title="Imprimir Pedido"
                >
                  <Printer className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-lg">
                      {selectedOrder.customer_name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{selectedOrder.customer_name}</h3>
                      <p className="text-sm text-gray-500">{selectedOrder.phone}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">{getTimeAgo(selectedOrder.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">
                        {selectedOrder.delivery_type === 'delivery' ? 'Entrega' : 
                          selectedOrder.delivery_type === 'pickup' ? 'Retirada' : 
                          selectedOrder.delivery_type === 'table' ? 'Mesa' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <CreditCard className="w-4 h-4" />
                      <span className="text-sm">Pagamento na entrega</span>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2">Resumo do Pedido</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>R$ {selectedOrder.total.toFixed(2)}</span>
                    </div>
                    {selectedOrder.delivery_type === 'delivery' && (
                      <div className="flex justify-between text-gray-600">
                        <span>Taxa de entrega</span>
                        <span>R$ 3,00</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                      <span>Total</span>
                      <span>R$ {(selectedOrder.delivery_type === 'delivery' ? Number(selectedOrder.total) + 3 : selectedOrder.total).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="mt-6 space-y-4">
                {renderOrderItems(selectedOrder.order_items)}
                
                {/* Order Total */}
                <div className="border-t pt-4 mt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>R$ {selectedOrder.total.toFixed(2)}</span>
                    </div>
                    {selectedOrder.delivery_type === 'delivery' && (
                      <div className="flex justify-between text-gray-600">
                        <span>Taxa de entrega</span>
                        <span>R$ 3,00</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                      <span>Total</span>
                      <span>R$ {(selectedOrder.delivery_type === 'delivery' ? Number(selectedOrder.total) + 3 : selectedOrder.total).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {selectedOrder.observation && (
                <div className="mt-4 p-3 bg-gray-50 rounded-md">
                  <p className="text-sm font-medium text-gray-700">Observações:</p>
                  <p className="text-sm text-gray-600 mt-1">{selectedOrder.observation}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      <Toaster position="top-center" />
    </div>
  );
}

export default AdminDashboard;