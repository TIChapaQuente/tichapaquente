import { create } from 'zustand';

interface Extra {
  id: number;
  name: string;
  price: number;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  variation_id: string | null;
  extras?: Extra[];
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateItemExtras: (id: string, extras: Extra[]) => void;
  clearCart: () => void;
  total: (isDelivery: boolean) => number;
  subtotal: () => number;
  deliveryFee: number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  deliveryFee: 3.00,

  addItem: (newItem) => {
    set((state) => {
      const existingItemIndex = state.items.findIndex(
        (item) => item.id === newItem.id && item.variation_id === newItem.variation_id
      );

      if (existingItemIndex > -1) {
        const updatedItems = [...state.items];
        updatedItems[existingItemIndex].quantity += 1;
        return { items: updatedItems };
      }

      return { items: [...state.items, { ...newItem, quantity: 1, extras: [] }] };
    });
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    }));
  },

  updateQuantity: (id, quantity) => {
    set((state) => ({
      items: quantity === 0
        ? state.items.filter(item => item.id !== id)
        : state.items.map((item) =>
            item.id === id ? { ...item, quantity } : item
          ),
    }));
  },

  updateItemExtras: (id, extras) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, extras } : item
      ),
    }));
  },

  clearCart: () => set({ items: [] }),

  subtotal: () => {
    const items = get().items;
    return items.reduce((sum, item) => {
      const itemTotal = item.price * item.quantity;
      const extrasTotal = item.extras?.reduce((extraSum, extra) => extraSum + extra.price, 0) || 0;
      return sum + itemTotal + (extrasTotal * item.quantity);
    }, 0);
  },

  total: (isDelivery) => {
    return get().subtotal() + (isDelivery ? get().deliveryFee : 0);
  },
}));