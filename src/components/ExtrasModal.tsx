import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Extra {
  id: number;
  name: string;
  price: number;
}

interface ExtrasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedExtras: Extra[]) => void;
  currentExtras?: Extra[];
  itemId: string;
}

export function ExtrasModal({ isOpen, onClose, onConfirm, currentExtras = [], itemId }: ExtrasModalProps) {
  const [extras, setExtras] = useState<Extra[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<Extra[]>(currentExtras);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchExtras();
      setSelectedExtras(currentExtras);
    }
  }, [isOpen, currentExtras]);

  async function fetchExtras() {
    try {
      const { data, error } = await supabase
        .from('extras')
        .select('id, name, price')
        .order('name');

      if (error) throw error;
      setExtras(data || []);
    } catch (error) {
      console.error('Erro ao carregar adicionais:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleExtraToggle = (extra: Extra) => {
    setSelectedExtras(prev => {
      const isSelected = prev.some(item => item.id === extra.id);
      if (isSelected) {
        return prev.filter(item => item.id !== extra.id);
      } else {
        return [...prev, extra];
      }
    });
  };

  const handleConfirm = () => {
    onConfirm(selectedExtras);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-red-600">Adicionais</h2>
          <button onClick={onClose} className="text-red-500 hover:text-red-700">
            <X size={24} />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-4">Carregando...</div>
        ) : extras.length === 0 ? (
          <div className="text-center py-4">Nenhum adicional disponível</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto overscroll-contain touch-pan-y">
            {extras.map((extra) => (
              <div
                key={extra.id}
                className="flex items-center justify-between p-2 hover:bg-red-50 rounded"
              >
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedExtras.some(item => item.id === extra.id)}
                    onChange={() => handleExtraToggle(extra)}
                    className="mr-3 h-4 w-4 text-red-600 focus:ring-red-500"
                  />
                  <span>{extra.name}</span>
                </div>
                <span className="text-red-600">
                  R$ {extra.price.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-red-600 hover:text-red-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
